const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');


router.get('/seller-balance',authMiddleware, payController.getSellerBalance);
// router.get('/seller-transfers', payController.getSellerTransfers);

router.post('/create-payout',authMiddleware, payController.createPayout);
router.post('/create-connected-account',authMiddleware, payController.createConnectedAccount);
router.post('/add-bank-account',authMiddleware, payController.addBankAccount);
router.post('/create-payout-for-auction',authMiddleware, payController.createPayoutForAuction);

module.exports = router;
