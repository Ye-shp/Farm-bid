const express = require('express');
const router = express.Router();

const {
  createProduct,
  getFarmerProducts,
  getproductCategories,
  getAllowedCategories,
  getAllowedProducts,
} = require('../controllers/productControllers'); 

const authenticateUser = require('../middleware/authMiddleware');

// Protected Routes (require authentication)
router.post('/', authenticateUser, createProduct);
router.get('/farmer-products', authenticateUser, getFarmerProducts);

router.get('/categories', getproductCategories);
router.get('/allowed-categories', getAllowedCategories);
router.get('/allowed-products', getAllowedProducts);

module.exports = router;
