const express = require('express');
const { createProduct, getFarmerProducts } = require('../controllers/productControllers');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Include multer middleware for image upload
router.post('/', authMiddleware, createProduct);
router.get('/farmer-products', authMiddleware, getFarmerProducts);

module.exports = router;
