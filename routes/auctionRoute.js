const express = require('express');
const { createAuction, getAuctions, getFarmerAuctions, submitBid } = require('../controllers/auctionControllers');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create an auction
router.post('/create', authMiddleware, createAuction);

// Get all auctions (for buyers)
router.get('/', getAuctions);

// Get farmer's auctions
router.get('/farmer-auctions', authMiddleware, getFarmerAuctions);

// Submit a bid
router.post('/:auctionId/bid', authMiddleware, submitBid); // Add this route for submitting bids

module.exports = router;
