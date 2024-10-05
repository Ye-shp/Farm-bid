const AWS = require('aws-sdk');
const Product = require('../models/Product');
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

// Create a new product with an image
exports.createProduct = [
  upload.single('image'), // Use multer middleware to handle the file upload
  async (req, res) => {
    const { title, description } = req.body;
    const imageUrl = req.file ? req.file.location : 'https://example.com/default-image.jpg'; // S3 URL or default

    try {
      const newProduct = new Product({
        title,
        description,
        imageUrl, // Save the image URL to the product
        user: req.user.id, // Link the product to the authenticated user
      });

      await newProduct.save();
      res.status(201).json(newProduct); // Respond with the new product
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: error.message });
    }
  },
];

// Get products for the authenticated farmer
exports.getFarmerProducts = async (req, res) => {
  try {
    const products = await Product.find({ user: req.user.id }); // Find products by user
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
};
