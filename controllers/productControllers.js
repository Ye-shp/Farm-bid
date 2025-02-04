const AWS = require('aws-sdk');
const {Product, productCategories, allowedCategories, allowedProducts }= require('../models/Product');
const multer = require('multer');
const multerS3 = require('multer-s3');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Multer setup to upload directly to S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + '-' + file.originalname);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit files to 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});

exports.getproductCategories = (req, res) => {
  try {
    res.json(productCategories);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: 'Server error fetching product categories' });
  }
};

// Updated productDetails controller with technical specs
exports.productDetails = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .select('title customProduct category totalQuantity description imageUrl status createdAt user certifications productSpecs productionPractices')
      .lean();

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Enhanced response with technical data
    const responseData = {
      ...product,
      displayName: product.title || product.customProduct,
      stockStatus: product.totalQuantity > 0 ? 'In Stock' : 'Out of Stock',
      lastUpdated: product.createdAt,
      isOwner: false,
      technicalSpecs: {
        certifications: product.certifications,
        productDetails: product.productSpecs,
        productionInfo: product.productionPractices
      }
    };

    // Add ownership flag if authenticated
    if (req.user && product.user.toString() === req.user.id) {
      responseData.isOwner = true;
      // Include raw technical data for owners
      responseData.rawTechnicalData = {
        certifications: product.certifications,
        productSpecs: product.productSpecs,
        productionPractices: product.productionPractices
      };
    }

    res.json(responseData);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Updated createProduct controller with technical specs handling
exports.createProduct = [
  upload.single('image'),
  async (req, res) => {
    try {
      // Parse technical specifications from JSON strings
      const technicalData = {
        certifications: req.body.certifications ? JSON.parse(req.body.certifications) : undefined,
        productSpecs: req.body.productSpecs ? JSON.parse(req.body.productSpecs) : undefined,
        productionPractices: req.body.productionPractices ? JSON.parse(req.body.productionPractices) : undefined
      };

      const { category, title, customProduct, description } = req.body;
      const totalQuantity = Number(req.body.totalQuantity);

      // Validate user
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      // Validate category
      if (!allowedCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }

      // Validate quantity
      if (isNaN(totalQuantity) || totalQuantity <= 0 || totalQuantity > 1000000) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }

      // Validate title/custom product
      if (!title && !customProduct) {
        return res.status(400).json({ error: 'Product name required' });
      }
      if (title && customProduct) {
        return res.status(400).json({ error: 'Ambiguous product naming' });
      }
      if (title && !allowedProducts.includes(title)) {
        return res.status(400).json({ error: 'Invalid product title' });
      }

      // Create new product with technical specs
      const newProduct = new Product({
        category,
        title,
        customProduct,
        description,
        imageUrl: req.file?.location || 'https://example.com/default-image.jpg',
        user: req.user.id,
        totalQuantity,
        status: 'Approved',
        ...technicalData
      });

      await newProduct.save();
      res.status(201).json(newProduct);

    } catch (error) {
      console.error('Product creation error:', error);
      
      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid technical specifications format' });
      }

      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ errors });
      }

      res.status(500).json({ error: 'Server error' });
    }
  },
];

// Updated getFarmerProducts with technical data filtering
exports.getFarmerProducts = async (req, res) => {
  try {
    const farmerId = req.query.farmerId || req.user.id;
    const products = await Product.find({ user: farmerId })
      .select('title category totalQuantity status certifications productSpecs productionPractices');

    const formattedProducts = products.map(product => ({
      ...product.toObject(),
      technicalSpecs: {
        hasCertifications: !!product.certifications,
        hasProductionData: !!product.productionPractices,
        hasProductSpecs: !!product.productSpecs
      }
    }));

    res.json(formattedProducts);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
};


// use this later when we start manually approving products
exports.approveProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.status = 'Approved';
    await product.save();

    res.json({ message: 'Product approved successfully', product });
  } catch (err) {
    console.error('Error approving product:', err);
    res.status(500).json({ message: 'Failed to approve product', error: err.message });
  }
};