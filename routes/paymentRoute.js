const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { 
  processPayment,
  processPayout,
  getPaymentStatus,
  getPayoutStatus,
  createPaymentIntent,
  handleWebhook,
  getPaymentDetails 
} = require('../controllers/paymentController');

// Configure express to use raw body for webhook
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Use JSON parsing for other routes
router.post('/create-payment-intent', createPaymentIntent);
router.get('/payment/:paymentIntentId', getPaymentDetails);

// Process payment for a contract (buyer)
router.post('/process/:contractId', authMiddleware, processPayment);

// Process payout to farmer
router.post('/payout/:contractId', authMiddleware, processPayout);

// Get payment status
router.get('/status/:paymentId', authMiddleware, getPaymentStatus);

// Get payout status
router.get('/payout/status/:payoutId', authMiddleware, getPayoutStatus);

module.exports = router;