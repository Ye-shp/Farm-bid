const express = require('express');
const router = express.Router();
const { getNearbyFarmers } = require('../controllers/farmerController');
const {authMiddleware} = require('../middleware/authMiddleware');

// Route to get nearby farmers (protected by authMiddleware)
router.post('/nearby', authMiddleware, getNearbyFarmers);

module.exports = router;
