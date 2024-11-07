// routes/payoutRoutes.js

const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');

router.post('/create-payout', payoutController.createPayout);
router.post('/create-connected-account',payoutController.createConnectedAccount);

module.exports = router;
