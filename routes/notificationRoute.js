// In routes/notifications.js
const express = require('express');
const router = express.Router();
const { getNotifications } = require('../controllers/auctionControllers');
const {authMiddleware} = require('../middleware/authMiddleware');

router.get('/', authMiddleware, getNotifications);

module.exports = router;
