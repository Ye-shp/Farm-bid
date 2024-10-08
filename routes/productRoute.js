const express = require('express');
const { createProduct, getFarmerProducts } = require('../controllers/productControllers');
const {authMiddleware }= require('../middleware/authMiddleware');

const router = express.Router();

// POST route for creating a new product (with image upload)
router.post('/', authMiddleware, createProduct);

// GET route for fetching products by the authenticated farmer
router.get('/farmer-products', authMiddleware, getFarmerProducts);

module.exports = router;
