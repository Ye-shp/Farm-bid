const AWS = require('aws-sdk');
const {Product, productCategories }= require('../models/Product');
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
console.log('S3 Bucket Name:', process.env.S3_BUCKET_NAME);
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + '-' + file.originalname); // Use a unique filename
    },
  }),
});
//Product categories 
exports.getproductCategories =(req, res ) =>{
  try {
    if (!req.user){
      return res.status(401).json({ error: 'Unauthorized'});
    }
    else {
    res.json(productCategories);
    }
  }catch (error){
    console.error('Error fetching product categories:', error);
    res.status(500).json({error: 'Server error product categories '});
  }
}
// Create a new product with an image
exports.createProduct = [
  upload.single('image'),
  async (req, res) => {
    const { category, title, customProduct, description } = req.body;
    const imageUrl = req.file ? req.file.location : 'https://example.com/default-image.jpg';

    try {
      // Validation: Ensure either title or customProduct is provided, but not both
      if (!title && !customProduct) {
        return res.status(400).json({ error: 'Please provide either a product title or a custom product name.' });
      }
      if (title && customProduct) {
        return res.status(400).json({ error: 'Please provide only one of product title or custom product name.' });
      }

      const newProduct = new Product({
        category,
        title,
        customProduct,
        description,
        imageUrl,
        user: req.user.id,
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (error) {
      console.error('Error creating product:', error);

      if (error.name === 'ValidationError') {
        // Handle Mongoose validation errors
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: 'Server error' });
    }
  },
];

// Get products for the authenticated farmer
exports.getFarmerProducts = async (req, res) => {
  try {
    const products = await Product.find({ user: req.user.id });
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
};
