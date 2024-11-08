// routes/payoutRoutes.js

const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');

router.post('/create-payout', payController.createPayout);
router.post('/create-connected-account',payController.createConnectedAccount);
router.post('/add-bank-account', payController.addBankAccount);

module.exports = router;
