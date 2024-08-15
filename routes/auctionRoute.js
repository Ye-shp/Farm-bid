const express = require('express');
const authMiddleware = require('../middleware/authMiddleware'); // Ensure only authenticated users can create auctions
const { createAuction, getFarmerAuctions, getAuctions } = require('../controllers/auctionControllers'); // Import controllers

const router = express.Router();

// Route to create a new auction
router.post('/create', authMiddleware, createAuction);

// Route to get auctions created by the logged-in farmer
router.get('/farmer-auctions', authMiddleware, getFarmerAuctions);

// Route to get all auctions (e.g., for buyers)
router.get('/all-auctions', authMiddleware, getAuctions);

module.exports = router;
