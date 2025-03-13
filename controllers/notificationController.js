const notificationService = require('../services/notificationService');
const {
  NotificationModel,
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  PRIORITY_LEVELS,
  DELIVERY_CHANNELS
} = require('../models/Notification');
const User = require('../models/User');
const Auction = require('../models/Auction');
const OpenContract = require('../models/OpenContract');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

// High-priority notification types that should always send emails
const HIGH_PRIORITY_NOTIFICATIONS = [
  NOTIFICATION_TYPES.PAYMENT_FAILED,
  NOTIFICATION_TYPES.AUCTION_WON,
  NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL,
  NOTIFICATION_TYPES.CONTRACT_ACCEPTED,
  NOTIFICATION_TYPES.RECURRING_PAYMENT_REMINDER
];

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
    priority: PRIORITY_LEVELS.HIGH,
    template: async (referenceId) => {
      const transaction = await Transaction.findById(referenceId);
      return {
        title: 'Payment Successful',
        message: `Your payment of $${transaction.amount.toFixed(2)} has been processed successfully.`,
        action: {
          type: 'link',
          text: 'View Details',
          url: `/transactions/${referenceId}`
        }
      };
    }
  },

  [NOTIFICATION_TYPES.PAYMENT_FAILED]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL, DELIVERY_CHANNELS.SMS],
    priority: PRIORITY_LEVELS.URGENT,
    template: async (referenceId) => {
      const transaction = await Transaction.findById(referenceId);
      return {
        title: 'Payment Failed - Action Required',
        message: `Your payment of $${transaction.amount.toFixed(2)} could not be processed. Please update your payment method.`,
        action: {
          type: 'link',
          text: 'Update Payment Method',
          url: `/payment-settings`
        }
      };
    }
  },

  // Contract Notifications
  [NOTIFICATION_TYPES.CONTRACT_ACCEPTED]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.HIGH,
    template: async (referenceId) => {
      const contract = await OpenContract.findById(referenceId)
        .populate('seller', 'username');
      return {
        title: 'Contract Accepted',
        message: `Your contract for ${contract.productType} has been accepted by ${contract.seller.username}.`,
        action: {
          type: 'link',
          text: 'View Contract',
          url: `/contracts/${referenceId}`
        }
      };
    }
  },

  [NOTIFICATION_TYPES.RECURRING_PAYMENT_REMINDER]: {
    channels: [DELIVERY_CHANNELS.IN_APP, DELIVERY_CHANNELS.EMAIL],
    priority: PRIORITY_LEVELS.HIGH,
    template: async (referenceId, data) => {
      const contract = await OpenContract.findById(referenceId);
      const daysUntilPayment = data?.daysUntilPayment || 3;
      return {
        title: 'Upcoming Recurring Payment',
        message: `Your recurring payment of $${contract.recurringDetails.amount.toFixed(2)} for ${contract.productType} will be processed in ${daysUntilPayment} days.`,
        action: {
          type: 'link',
          text: 'View Contract',
          url: `/contracts/${referenceId}`
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
    const { type, reference, data } = req.body;
    const userId = req.user.id;

    // Validate notification type
    if (!NOTIFICATION_TYPES[type]) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Validate reference exists if provided
    if (reference) {
      try {
        const model = mongoose.model(reference.model);
        const exists = await model.exists({ _id: reference.id });
        if (!exists) return res.status(404).json({ error: 'Reference not found' });
      } catch (err) {
        return res.status(400).json({ error: 'Invalid reference model' });
      }
    }

    // Get configuration
    const config = NOTIFICATION_CONFIG[type];
    if (!config) return res.status(400).json({ error: 'Unsupported notification type' });

    // Generate content
    const templateData = await config.template(reference?.id, data);
    
    // Determine if this is a high-priority notification
    const isHighPriority = HIGH_PRIORITY_NOTIFICATIONS.includes(type);
    
    // Create notification
    const notification = await notificationService.createAndSendNotification(
      userId,
      {
        ...templateData,
        type,
        category: type.split('_')[0].toUpperCase(),
        priority: isHighPriority ? PRIORITY_LEVELS.HIGH : config.priority,
        channels: config.channels,
        reference,
        metadata: data
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
    const { status, category, limit = 20, page = 1 } = req.query;
    const userId = req.user.id;

    const query = { user: userId };
    if (status === 'read') query['status.read'] = true;
    if (status === 'unread') query['status.read'] = false;
    if (category) query.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('reference.id')
      .lean();
    
    const total = await NotificationModel.countDocuments(query);

    res.json({
      notifications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
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

// Delete a single notification
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await NotificationModel.findById(req.params.notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.user.toString() !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await notification.deleteOne();
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('notificationUpdate', {
        action: 'delete',
        notificationId: req.params.notificationId
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete all notifications for a user
exports.deleteAllNotifications = async (req, res) => {
  try {
    const { category } = req.query;
    const query = { user: req.user.id };
    
    if (category) {
      query.category = category;
    }
    
    const result = await NotificationModel.deleteMany(query);
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${req.user.id}`).emit('notificationUpdate', {
        action: 'deleteAll',
        category: category || 'all'
      });
    }
    
    res.json({ 
      success: true, 
      deleted: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get unread notification count
exports.getUnreadCount = async (req, res) => {
  try {
    // Ensure we have a valid user ID
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Convert user ID to ObjectId safely - using string comparison instead of ObjectId conversion
    const userId = req.user.id;
    
    // Try different query formats based on possible schema structures
    let total = 0;
    
    try {
      // First try with status.read field (nested structure)
      total = await NotificationModel.countDocuments({ 
        user: userId, 
        'status.read': false 
      });
    } catch (err) {
      console.log('First query attempt failed, trying alternative schema:', err);
      
      try {
        // Then try with direct read field
        total = await NotificationModel.countDocuments({ 
          user: userId, 
          read: false 
        });
      } catch (innerErr) {
        console.log('Second query attempt failed:', innerErr);
        // Default to 0 if both queries fail
        total = 0;
      }
    }
    
    // Format response
    const result = {
      total,
      byCategory: {} // We'll skip the category breakdown for now to simplify
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error getting unread count:', error);
    // Return 0 count instead of error to prevent frontend issues
    res.json({ 
      total: 0,
      byCategory: {},
      error: error.message
    });
  }
};

// Get notifications by batch (for initial load and pagination)
exports.getBatchNotifications = async (req, res) => {
  try {
    const { 
      status = 'all', 
      category, 
      limit = 20, 
      before, 
      after 
    } = req.query;
    
    const userId = req.user.id;
    const query = { user: userId };
    
    // Filter by status
    if (status === 'read') query['status.read'] = true;
    if (status === 'unread') query['status.read'] = false;
    
    // Filter by category
    if (category) query.category = category;
    
    // Pagination using createdAt timestamps
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    } else if (after) {
      query.createdAt = { $gt: new Date(after) };
    }
    
    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: before ? -1 : 1 })
      .limit(parseInt(limit))
      .populate('reference.id')
      .lean();
    
    // If we're paginating forward, reverse the results to maintain chronological order
    if (after) {
      notifications.reverse();
    }
    
    // Get the total count for the query (without pagination)
    const total = await NotificationModel.countDocuments({
      user: userId,
      ...(status === 'read' ? { 'status.read': true } : {}),
      ...(status === 'unread' ? { 'status.read': false } : {}),
      ...(category ? { category } : {})
    });
    
    res.json({
      notifications,
      pagination: {
        total,
        hasMore: notifications.length === parseInt(limit),
        nextCursor: notifications.length > 0 ? 
          (before ? notifications[notifications.length - 1].createdAt : notifications[0].createdAt) : 
          null
      }
    });
  } catch (error) {
    console.error('Error fetching batch notifications:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getNotificationPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationPreferences');
    res.json(user.notificationPreferences || {
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      categories: {
        auction: true,
        payment: true,
        contract: true,
        system: true
      }
    });
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

// Send a test notification (for development purposes)
exports.sendTestNotification = async (req, res) => {
  try {
    const { type } = req.body;
    const userId = req.user.id;
    
    if (!type || !NOTIFICATION_TYPES[type]) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }
    
    // Create a test notification
    const notification = await notificationService.sendNotification({
      recipient: userId,
      type: type,
      title: `Test ${type.replace(/_/g, ' ')}`,
      message: `This is a test ${type.replace(/_/g, ' ')} notification.`,
      data: {
        isTest: true,
        timestamp: new Date().toISOString(),
        actionUrl: '/notifications'
      },
      priority: HIGH_PRIORITY_NOTIFICATIONS.includes(type) ? 
        PRIORITY_LEVELS.HIGH : PRIORITY_LEVELS.MEDIUM
    });
    
    res.json({ success: true, notification });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: error.message });
  }
};