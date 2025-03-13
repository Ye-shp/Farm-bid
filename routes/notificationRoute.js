const express = require('express');
const router = express.Router();
const {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestNotification,
  deleteNotification,
  deleteAllNotifications,
  getUnreadCount,
  getBatchNotifications
} = require('../controllers/notificationController');

const { authMiddleware } = require('../middleware/authMiddleware');

// Notification creation
router.post('/', authMiddleware, createNotification);

// Notification retrieval
router.get('/', authMiddleware, getNotifications);
router.get('/batch', authMiddleware, getBatchNotifications);
router.get('/unread-count', authMiddleware, getUnreadCount);

// Single notification actions
router.put('/:notificationId/read', authMiddleware, markAsRead);
router.delete('/:notificationId', authMiddleware, deleteNotification);

// Bulk notification actions
router.put('/mark-all-read', authMiddleware, markAllAsRead);
router.delete('/', authMiddleware, deleteAllNotifications);

// Notification preferences
router.get('/preferences', authMiddleware, getNotificationPreferences);
router.put('/preferences', authMiddleware, updateNotificationPreferences);

// Test notification endpoint (for development only)
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', authMiddleware, sendTestNotification);
}

module.exports = router;                                                                                                                                                                                                                                                                                                                                                                                                                   