const express = require('express');
const { createProduct, getFarmerProducts, getproductCategories } = require('../controllers/productControllers');
const {getAllowedCategories, getAllowedProducts} = require('../models/Product')
const {authMiddleware }= require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, createProduct);

// GET route for fetching products by the authenticated farmer
router.get('/farmer-products', authMiddleware, getFarmerProducts);
router.get ('/categories', authMiddleware, getproductCategories);
router.get ('/allowed-categories',authMiddleware, getAllowedCategories);
router.get ('/allowed-products', authMiddleware, getAllowedProducts);


module.exports = router;
