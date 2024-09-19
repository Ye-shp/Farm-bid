const express = require('express');
const { createAuction } = require('../controllers/auctionControllers');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/create', authMiddleware, createAuction);  // Protect this route with authMiddleware

module.exports = router;
