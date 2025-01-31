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

// Update productDetails controller
exports.productDetails = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .select('title customProduct category totalQuantity description imageUrl status createdAt user')
      .lean();

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Public inventory data
    const responseData = {
      ...product,
      displayName: product.title || product.customProduct,
      stockStatus: product.totalQuantity > 0 ? 'In Stock' : 'Out of Stock',
      lastUpdated: product.createdAt,
      isOwner: false // Default value
    };

    // Add ownership flag if authenticated
    if (req.user && product.user.toString() === req.user.id) {
      responseData.isOwner = true;
    }

    res.json(responseData);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add new analytics controller
exports.productAnalytics = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .select('totalQuantity user createdAt')
      .populate('user', 'name email');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Authorization check
    if (product.user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Analytics calculations
    const analyticsData = {
      currentStock: product.totalQuantity,
      daysSinceCreation: Math.floor((Date.now() - product.createdAt) / (1000 * 3600 * 24)),
      stockHealth: product.totalQuantity > 50 ? 'Healthy' : 'Needs Restock',
      estimatedRestockDays: product.totalQuantity > 50 ? null : 7 // Example calculation
    };

    res.json(analyticsData);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.createProduct = [
  upload.single('image'),
  async (req, res) => {
    const { category, title, customProduct, description, } = req.body;
    const totalQuantity = Number(req.body.totalQuantity);

    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate category
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category provided.' });
    }

    if (isNaN(totalQuantity) || totalQuantity <= 0 || totalQuantity > 1000000) {
      return res.status(400).json({ error: 'Invalid totalQuantity provided' });
    }
    
    // Validation: Ensure either title or customProduct is provided, but not both
    if (!title && !customProduct) {
      return res.status(400).json({ error: 'Please provide either a product title or a custom product name.' });
    }
    if (title && customProduct) {
      return res.status(400).json({ error: 'Please provide only one of product title or custom product name.' });
    }

    if (title && !allowedProducts.includes(title)) {
      return res.status(400).json({ error: 'Invalid product title provided.' });
    }

    const imageUrl = req.file ? req.file.location : 'https://example.com/default-image.jpg';

    try {
      const newProduct = new Product({
        category,
        title,
        customProduct,
        description,
        imageUrl,
        user: req.user.id,
        totalQuantity,
        status: 'Approved',
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (error) {
      console.error('Error creating product:', error);

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err) => err.message);
        return res.status(400).json({ errors });
      }

      res.status(500).json({ error: 'Server error' });
    }
  },
];

exports.getallowedCategories = async (req,res)=>{
  res.json(allowedCategories);
};

exports.getallowedProducts = async (req,res)=>{
  res.json(allowedProducts);
};

// Get products for a specific farmer
exports.getFarmerProducts = async (req, res) => {
  try {
    // Get farmerId from query parameter, fallback to authenticated user's id
    const farmerId = req.query.farmerId || req.user.id;
    
    const products = await Product.find({ user: farmerId });
    res.json(products);
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