const express = require('express');
const { 
  createAuction, 
  getAuctions, 
  getFarmerAuctions, 
  submitBid,
  getAuctionDetails,
  acceptBid,
  createPaymentIntent,
  handlePaymentWebhook
} = require('../controllers/auctionControllers');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create an auction
router.post('/create', authMiddleware, createAuction);

// Get all auctions (for buyers)
router.get('/', getAuctions);

// Get farmer's auctions
router.get('/farmer-auctions', authMiddleware, getFarmerAuctions);

// Get specific auction details
router.get('/:auctionId', authMiddleware, getAuctionDetails);

// Submit a bid
router.post('/:auctionId/bid', authMiddleware, submitBid);

// Accept a bid
router.post('/:auctionId/accept', authMiddleware, acceptBid);

// Create payment intent for auction
router.post('/:auctionId/payment-intent', authMiddleware, createPaymentIntent);

// Handle Stripe webhook
router.post('/webhook', express.raw({type: 'application/json'}), handlePaymentWebhook);

module.exports = router;