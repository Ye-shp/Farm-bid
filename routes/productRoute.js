const express = require('express');
const router = express.Router();

const {
  createProduct,
  getFarmerProducts,
  getproductCategories
} = require('../controllers/productControllers'); 

const {allowedCategories, allowedProducts} = require('../models/Product');

const {authMiddleware} = require('../middleware/authMiddleware');

// Protected Routes (require authentication)
router.post('/', authMiddleware, createProduct);
router.get('/farmer-products', authMiddleware, getFarmerProducts);

router.get('/categories', getproductCategories);

router.get('/allowed-categories', (req, res) => {
  res.json(allowedCategories);
});

router.get('/allowed-products', (req, res) => {
  res.json(allowedProducts);
});


module.exports = router;
