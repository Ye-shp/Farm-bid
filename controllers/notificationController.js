// In a new or existing notifications controller
const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
  try {
    console.log('Getting notifications for user:', req.user.id); // Debug log
    const notifications = await Notification.find({ user: req.user.id })
      .sort({ createdAt: -1 });
    console.log('Found notifications:', notifications); // Debug log
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

    // Verify the notification belongs to the requesting user
    if (notification.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to modify this notification' });
    }

    notification.read = true;
    await notification.save();

    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Error in markNotificationAsRead:', err);
    res.status(500).json({ error: err.message });
  }
};