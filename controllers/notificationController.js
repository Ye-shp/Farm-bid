// In a new or existing notifications controller
exports.getNotifications = async (req, res) => {
    try {
      const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
      res.json(notifications);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
  