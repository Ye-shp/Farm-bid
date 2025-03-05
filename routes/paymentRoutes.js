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

router.post('/add-bank-account', protect, addBankAccount);
router.post('/request-payout', protect, requestPayout);
router.get('/balance', protect, getSellerBalance);
router.get('/transfers', protect, getSellerTransfers);
router.post('/create-connected-account', protect, createConnectedAccount);

// ... other routes ...

module.exports = router; 