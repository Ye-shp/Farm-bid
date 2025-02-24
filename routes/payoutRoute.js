const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');


router.get('/seller-balance', payController.getSellerBalance);
router.get('/seller-transfers', payController.getSellerTransfers);

router.post('/create-payout', payController.createPayout);
router.post('/create-connected-account', payController.createConnectedAccount);
router.post('/add-bank-account', payController.addBankAccount);
router.post('/create-payout-for-auction', payController.createPayoutForAuction);

module.exports = router;
