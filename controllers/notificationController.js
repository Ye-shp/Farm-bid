// In a new or existing notifications controller
const Notification = require('../models/Notification');

// Helper function to emit notification
const emitNotification = (io, userId, notification) => {
  if (io) {
    console.log('Emitting notification to user:', userId);
    io.to(`user_${userId}`).emit('newNotification', notification);
  } else {
    console.warn('Socket.IO instance not available');
  }
};

exports.createAndEmitNotification = async (req, userId, notificationData) => {
  try {
    console.log('Creating notification for user:', userId);
    const notification = await Notification.create({
      user: userId,
      ...notificationData
    });
    
    // Get the io instance from the app
    const io = req.app.get('io');
    emitNotification(io, userId, notification);
    
    return notification;
  } catch (error) {
    console.error('Error in createAndEmitNotification:', error);
    throw error;
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error('Error in getNotifications:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to modify this notification' });
    }

    notification.read = true;
    await notification.save();

    // Emit the updated notification
    const io = req.app.get('io');
    emitNotification(io, req.user.id, notification);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error in markNotificationAsRead:', err);
    res.status(500).json({ error: err.message });
  }
};