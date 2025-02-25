const express = require('express');
const router = express.Router();

const {
  createProduct,
  getFarmerProducts,
  getproductCategories,
  getallowedProducts,
  getallowedCategories,
  approveProduct,
  productDetails,
  getproductAnalytics,
  getInventoryHistory,
} = require('../controllers/productControllers'); 

const {authMiddleware} = require('../middleware/authMiddleware');

// Protected Routes (require authentication)
router.post('/', authMiddleware, createProduct);
router.get('/farmer-products', authMiddleware, getFarmerProducts);
router.patch('/:productId/approve', authMiddleware, approveProduct);
router.get('/:productId/analytics', authMiddleware, getproductAnalytics);

// Inventory management routes
router.post('/:id/inventory', authMiddleware, createProduct);
router.get('/:id/inventory-history', authMiddleware, getInventoryHistory);

//Dont require auth
router.get('/categories', getproductCategories);

router.get('/:productId', productDetails ); 

router.get('/allowed-categories',authMiddleware, getallowedCategories)

router.get('/allowed-products', authMiddleware, getallowedProducts )

module.exports = router;
