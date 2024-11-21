const express = require('express');
const router = express.Router();
const { searchFarms } = require('../controllers/searchControllers');
const { authMiddleware } = require('../middleware/authMiddleware');

// Define the search route for farms
router.get('/farms', authMiddleware, searchFarms);

module.exports = router;
