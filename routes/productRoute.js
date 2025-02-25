const express = require('express');
const router = express.Router();
const { INVENTORY_REASONS } = require('../models/Product');

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
  updateInventory
} = require('../controllers/productControllers'); 

const {authMiddleware} = require('../middleware/authMiddleware');

// Protected Routes (require authentication)
router.post('/', authMiddleware, createProduct);
router.get('/farmer-products', authMiddleware, getFarmerProducts);

// Move these routes BEFORE any routes with parameters
router.get('/categories', getproductCategories);
router.get('/allowed-categories', authMiddleware, getallowedCategories);
router.get('/allowed-products', authMiddleware, getallowedProducts);
router.get('/inventory-reasons', authMiddleware, (req, res) => {
  res.json(INVENTORY_REASONS);
});

// Then put parameter routes AFTER
router.get('/:productId', productDetails);
router.patch('/:productId/approve', authMiddleware, approveProduct);
router.get('/:productId/analytics', authMiddleware, getproductAnalytics);
router.post('/:id/inventory', authMiddleware, updateInventory);
router.get('/:id/inventory-history', authMiddleware, getInventoryHistory);

module.exports = router;
