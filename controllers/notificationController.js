// In a new or existing notifications controller
const Notification = require('../models/Notification');

// Helper function to emit notification
const emitNotification = (req, notification) => {
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${notification.user}`).emit('newNotification', notification);
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching notifications for user:', userId);
    
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 });
    
    console.log(`Found ${notifications.length} notifications`);
    res.json(notifications);
  } catch (err) {
    console.error('Error in getNotifications:', err);
    res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
};

exports.createNotification = async (req, userId, notificationData) => {
  try {
    const notification = new Notification({
      user: userId,
      ...notificationData
    });
    await notification.save();
    emitNotification(req, notification);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Verify the notification belongs to the requesting user
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to modify this notification' });
    }

    notification.read = true;
    await notification.save();

    // Emit the updated notification
    emitNotification(req, notification);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error in markNotificationAsRead:', err);
    res.status(500).json({ error: err.message });
  }
};