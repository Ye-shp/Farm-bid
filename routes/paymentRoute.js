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

module.exports = router;