const express = require('express');
const router = express.Router();
const {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  updateNotificationPreferences
} = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Notification creation
router.post('/', authMiddleware, createNotification);

// Notification retrieval
router.get('/', authMiddleware, getNotifications);

// Single notification actions
router.put('/:notificationId/read', authMiddleware, markAsRead);

// Bulk notification actions
router.put('/mark-all-read', authMiddleware, markAllAsRead);                                                                                                                                                                                       

// Notification preferences
router.get('/preferences', authMiddleware, getNotificationPreferences);
router.put('/preferences', authMiddleware, updateNotificationPreferences);

module.exports = router;                                                                                                                                                                                                                                                                                                                                                                                                                   