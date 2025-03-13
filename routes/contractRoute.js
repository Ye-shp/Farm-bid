// routes/contractRoute.js
const express = require('express');
const { 
    createOpenContract, 
    getOpenContracts, 
    fulfillOpenContract, 
    acceptFulfillment,
    completeFulfillment,
    getUserContracts,
    getContractById,
    createContractPaymentIntent,
    handleContractPaymentSuccess,
    handleContractPaymentFailure,
    notifyExpiringContracts,
    notifyRecurringContracts
} = require('../controllers/contractController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create a contract (for buyers)
router.post('/create', authMiddleware, createOpenContract);

// Get all open contracts (for farmers to view)
router.get('/open', authMiddleware, getOpenContracts);

// Get user's contracts (both buyer and farmer)
router.get('/my-contracts', authMiddleware, getUserContracts);

// Get a single contract by ID
router.get('/:contractId', authMiddleware, getContractById);

// Fulfill an open contract (for farmers)
router.post('/:contractId/fulfill', authMiddleware, fulfillOpenContract);

// Accept a fulfillment offer (for buyers)
router.post('/:contractId/fulfillments/:fulfillmentId/accept', authMiddleware, acceptFulfillment);

// Complete a fulfillment (for farmers)
router.post('/:contractId/fulfillments/:fulfillmentId/complete', authMiddleware, completeFulfillment);

// Create payment intent for contract
router.post('/payment-intent', authMiddleware, createContractPaymentIntent);

// Handle contract payment success
router.post('/payment-success', authMiddleware, handleContractPaymentSuccess);

// Handle contract payment failure 
router.post('/payment-failure', authMiddleware, handleContractPaymentFailure);

// Notification endpoints
router.post('/notify-expiring', authMiddleware, notifyExpiringContracts);
router.post('/notify-recurring', authMiddleware, notifyRecurringContracts);

module.exports = router;
