// In routes/notifications.js
const express = require('express');
const router = express.Router();
const { getNotifications } = require('../controllers/auctionControllers');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, getNotifications);

module.exports = router;
