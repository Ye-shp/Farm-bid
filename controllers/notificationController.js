const notificationService = require('../services/notificationService');
const {
  NotificationModel,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  PRIORITY_LEVELS,
  DELIVERY_CHANNELS
} = require('../models/Notification');
const { User } = require('../models/User');
const Auction = require('../models/Auction');
const Payment = require('../models/Payment');
const Delivery = require('../models/Delivery');

// Notification type configuration
const NOTIFICATION_CONFIG = {
  // Auction Notifications
  [NOTIFICATION_TYPES.AUCTION_BID_PLACED]: {
    channels: [DELIVERY_CHANNELS.IN_APP],
    priority: PRIORITY_LEVELS.MEDIUM,
    template: async (referenceId) => {
      const auction = await Auction.findById(referenceId);
      return {
        title: 'New Bid Placed',
        message: `You've placed a bid on "${auction.title}"`,
        action: {
          type: 'link',
          text: 'View Auction',
          url: `/auctions/${referenceId}`
        }
      };
    }
  },

  [NOTIFICATION_TYPES.AUCTION_BID_OUTBID]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.HIGH,
    template: async (referenceId) => {
      const auction = await Auction.findById(referenceId);
      return {
        title: 'You Were Outbid',
        message: `Your bid on "${auction.title}" has been surpassed`,
        action: {
          type: 'link',
          text: 'Increase Bid',
          url: `/auctions/${referenceId}/bid`
        }
      };
    }
  },

  [NOTIFICATION_TYPES.AUCTION_WON]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.SMS, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.HIGH,
    template: async (referenceId) => {
      const auction = await Auction.findById(referenceId);
      return {
        title: 'Auction Won!',
        message: `Congratulations! You won "${auction.title}" for ${auction.currentBid}`,
        action: {
          type: 'link',
          text: 'Arrange Payment',
          url: `/payments/create?auction=${referenceId}`
        }
      };
    }
  },

  // Payment Notifications
  [NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.MEDIUM,
    template: async (referenceId) => {
      const payment = await Payment.findById(referenceId);
      return {
        title: 'Payment Successful',
        message: `Payment of ${payment.amount} for ${payment.description} was completed`,
        action: {
          type: 'link',
          text: 'View Receipt',
          url: `/payments/${referenceId}`
        }
      };
    }
  },

  [NOTIFICATION_TYPES.PAYMENT_FAILED]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.SMS, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.URGENT,
    template: async (referenceId) => {
      const payment = await Payment.findById(referenceId);
      return {
        title: 'Payment Failed',
        message: `Payment of ${payment.amount} failed. Please update your payment method`,
        action: {
          type: 'link',
          text: 'Retry Payment',
          url: `/payments/${referenceId}/retry`
        }
      };
    }
  },

  // Delivery Notifications
  [NOTIFICATION_TYPES.DELIVERY_SCHEDULED]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.SMS],
    priority: PRIORITY_LEVELS.MEDIUM,
    template: async (referenceId) => {
      const delivery = await Delivery.findById(referenceId).populate('auction');
      return {
        title: 'Delivery Scheduled',
        message: `Your ${delivery.auction.title} will arrive on ${delivery.estimatedDate}`,
        action: {
          type: 'link',
          text: 'Track Delivery',
          url: `/deliveries/${referenceId}`
        }
      };
    }
  },

  // System Notifications
  [NOTIFICATION_TYPES.SYSTEM_MAINTENANCE]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.HIGH,
    template: () => ({
      title: 'System Maintenance',
      message: 'Platform will be unavailable on Saturday 2AM-4AM GMT',
      action: null
    })
  },

  // User Notifications
  [NOTIFICATION_TYPES.USER_WELCOME]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.LOW,
    template: () => ({
      title: 'Welcome to Elipae!',
      message: 'Get started by exploring our marketplace',
      action: {
        type: 'link',
        text: 'Take Tour',
        url: '/welcome-tour'
      }
    })
  }
};

// Controller Methods
exports.createNotification = async (req, res) => {
  try {
    const { type, reference } = req.body;
    const userId = req.user.id;

    // Validate notification type
    if (!NOTIFICATION_TYPES[type]) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Validate reference exists
    if (reference) {
      const model = mongoose.model(reference.model);
      const exists = await model.exists({ _id: reference.id });
      if (!exists) return res.status(404).json({ error: 'Reference not found' });
    }

    // Get configuration
    const config = NOTIFICATION_CONFIG[type];
    if (!config) return res.status(400).json({ error: 'Unsupported notification type' });

    // Generate content
    const templateData = await config.template(reference?.id);
    
    // Create notification
    const notification = await notificationService.createAndSendNotification(
      userId,
      {
        ...templateData,
        type,
        category: type.split('_')[0].toUpperCase(),
        priority: config.priority,
        channels: config.channels,
        reference
      },
      req.app.get('io')
    );

    res.status(201).json(notification);
  } catch (error) {
    console.error('Notification creation error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const { status, category } = req.query;
    const userId = req.user.id;

    const query = { user: userId };
    if (status === 'read') query['status.read'] = true;
    if (status === 'unread') query['status.read'] = false;
    if (category) query.category = category;

    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .populate('reference.id')
      .lean();

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(
      req.params.notificationId,
      req.user.id
    );

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('notificationUpdate', {
        action: 'markRead',
        notificationId: notification._id
      });
    }

    res.json(notification);
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(error.message === 'Unauthorized' ? 403 : 500).json({ error: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await NotificationModel.updateMany(
      { user: req.user.id, 'status.read': false },
      { $set: { 'status.read': true, 'status.readAt': new Date() } }
    );

    // Emit bulk update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('notificationUpdate', {
        action: 'markAllRead'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationPreferences');
    res.json(user.notificationPreferences || {});
  } catch (error) {
    console.error('Error getting preferences:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { notificationPreferences: req.body } },
      { new: true, runValidators: true }
    ).select('notificationPreferences');
    
    res.json(user.notificationPreferences);
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: error.message });
  }
};