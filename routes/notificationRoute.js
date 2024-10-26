// In routes/notifications.js
const express = require('express');
const router = express.Router();
const { getNotifications, markNotificationAsRead } = require('../controllers/notificationController');
const {authMiddleware} = require('../middleware/authMiddleware');

router.get('/', authMiddleware, getNotifications);
router.put('/:notificationId/read', authMiddleware, markNotificationAsRead);


module.exports = router;
