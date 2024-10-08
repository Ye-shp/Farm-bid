const express = require('express');
const router = express.Router();
const { getNearbyBuyers } = require('../controllers/buyerController');
const {authMiddleware} = require('../middleware/authMiddleware');

// Route to get nearby buyers (protected by authMiddleware)
router.post('/nearby', authMiddleware, getNearbyBuyers);

module.exports = router;
