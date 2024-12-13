const express = require('express');
const router = express.Router();
const { 
    createPaymentIntent,
    handleWebhook,
    getPaymentDetails 
} = require('../controllers/payController');

// Configure express to use raw body for webhook
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Use JSON parsing for other routes
router.post('/create-payment-intent', createPaymentIntent);
router.get('/payment/:paymentIntentId', getPaymentDetails);

const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const { 
  processPayment,
  processPayout,
  getPaymentStatus,
  getPayoutStatus
} = require('../controllers/paymentController');

const paymentRouter = express.Router();

// Process payment for a contract (buyer)
paymentRouter.post('/process/:contractId', authMiddleware, processPayment);

// Process payout to farmer
paymentRouter.post('/payout/:contractId', authMiddleware, processPayout);

// Get payment status
paymentRouter.get('/status/:paymentId', authMiddleware, getPaymentStatus);

// Get payout status
paymentRouter.get('/payout/status/:payoutId', authMiddleware, getPayoutStatus);

module.exports = { router, paymentRouter };