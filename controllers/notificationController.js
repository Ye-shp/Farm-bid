// In a new or existing notifications controller
const Notification = require('../models/Notification');

exports.getNotifications = async (req, res) => {
    try {
      const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  
  exports.markNotificationAsRead = async (req, res) => {
    try {
      const notification = await Notification.findById(req.params.notificationId);
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
  
      notification.read = true;
      await notification.save();
  
      res.json({ message: 'Notification marked as read' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  