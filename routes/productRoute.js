const express = require('express');
const router = express.Router();

const {
  createProduct,
  getFarmerProducts,
  getproductCategories,
  getallowedProducts,
  getallowedCategories
} = require('../controllers/productControllers'); 

const {authMiddleware} = require('../middleware/authMiddleware');

// Protected Routes (require authentication)
router.post('/', authMiddleware, createProduct);
router.get('/farmer-products', authMiddleware, getFarmerProducts);

//Dont require auth
router.get('/categories', getproductCategories);

router.get('/allowed-categories',authMiddleware, getallowedCategories)

router.get('/allowed-products', authMiddleware, getallowedProducts )

module.exports = router;
