const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { 
    addBankAccount, 
    requestPayout,
    getSellerBalance,
    getSellerTransfers,
    createConnectedAccount 
} = require('../controllers/payController');

router.post('/payment/add-bank-account', protect, addBankAccount);
router.post('/payment/request-payout', protect, requestPayout);
router.get('/payment/balance', protect, getSellerBalance);
router.get('/payment/transfers', protect, getSellerTransfers);
router.post('/payment/create-connected-account', protect, createConnectedAccount);

// ... other routes ...

module.exports = router; 