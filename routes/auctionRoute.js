const express = require('express');
const { createAuction, getFarmerAuctions, getAuctions } = require('../controllers/auctionController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/create', authMiddleware, createAuction);
router.get('/farmer-auctions', authMiddleware, getFarmerAuctions);
router.get('/all-auctions', getAuctions);

module.exports = router;
