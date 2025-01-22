// In a new or existing notifications controller
const Notification = require('../models/Notification');

// Helper function to emit notification
const emitNotification = (io, userId, notification) => {
  if (!io) {
    console.error('Socket.IO instance not available');
    return;
  }

  const room = `user_${userId}`;
  console.log('Emitting notification:', {
    room,
    userId,
    notificationId: notification._id,
    type: notification.type,
    message: notification.message
  });

  io.to(room).emit('newNotification', notification);
  
  // Debug: Check room members
  const sockets = io.sockets.adapter.rooms.get(room);
  console.log('Room members:', {
    room,
    memberCount: sockets ? sockets.size : 0,
    members: sockets ? Array.from(sockets) : []
  });
};

exports.createAndEmitNotification = async (req, userId, notificationData) => {
  try {
    console.log('Creating notification:', {
      userId,
      type: notificationData.type,
      message: notificationData.message
    });

    const notification = await Notification.create({
      user: userId,
      ...notificationData
    });
    
    console.log('Notification created:', {
      id: notification._id,
      userId: notification.user,
      type: notification.type
    });
    
    // Get the io instance from the app
    const io = req.app.get('io');
    if (!io) {
      console.error('Socket.IO instance not found in app');
    } else {
      console.log('Socket.IO instance found, emitting notification');
      emitNotification(io, userId, notification);
    }
    
    return notification;
  } catch (error) {
    console.error('Error in createAndEmitNotification:', error);
    throw error;
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching notifications for user:', userId);
    
    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 });
      
    console.log('Found notifications:', {
      userId,
      count: notifications.length,
      notifications: notifications.map(n => ({
        id: n._id,
        type: n.type,
        read: n.read
      }))
    });
    
    res.json(notifications);
  } catch (err) {
    console.error('Error in getNotifications:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    console.log('Marking notification as read:', req.params.notificationId);
    
    const notification = await Notification.findById(req.params.notificationId);
    if (!notification) {
      console.log('Notification not found:', req.params.notificationId);
      return res.status(404).json({ message: 'Notification not found' });
    }

    if (notification.user.toString() !== req.user.id) {
      console.log('Unauthorized access:', {
        notificationUser: notification.user,
        requestUser: req.user.id
      });
      return res.status(403).json({ message: 'Not authorized to modify this notification' });
    }

    notification.read = true;
    await notification.save();
    console.log('Notification marked as read:', notification._id);

    // Emit the updated notification
    const io = req.app.get('io');
    emitNotification(io, req.user.id, notification);

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error in markNotificationAsRead:', err);
    res.status(500).json({ error: err.message });
  }
};