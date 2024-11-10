// routes/openContractRoutes.js
const express = require('express');
const { createOpenContract, getOpenContracts, fulfillOpenContract, closeOpenContract } = require('../controllers/contractController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create an open contract (for buyers)
router.post('/create', authMiddleware, createOpenContract);

// Get all open contracts (for farmers to view)
router.get('/', authMiddleware, getOpenContracts);

router.get('/:contractId', authMiddleware, getOpenContractById);

// Fulfill an open contract (for farmers)
router.post('/:contractId/fulfill', authMiddleware, fulfillOpenContract);

// Close an open contract (for buyers)
router.patch('/:contractId/close', authMiddleware, closeOpenContract);

module.exports = router;
