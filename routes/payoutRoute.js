// routes/payoutRoutes.js

const express = require('express');
const router = express.Router();
const payoutController = require('../controllers/payoutController');

router.post('/create-payout', payoutController.createPayout);

module.exports = router;
