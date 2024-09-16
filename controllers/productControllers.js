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
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    acl: 'public-read', // Set permissions
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + file.originalname); // unique filename
    },
  }),
});

// Create a new product with image
exports.createProduct = [
  upload.single('image'), // Use multer to handle the file upload
  async (req, res) => {
    const { title, description } = req.body;
    const imageUrl = req.file.location; // S3 URL

    try {
      const newProduct = new Product({
        title,
        description,
        imageUrl, // Save image URL
        user: req.user.id,
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
];
