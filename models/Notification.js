const mongoose = require('mongoose');

const PRIORITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

/**
 * Notification categories to group different types of notifications
 * and allow for easier filtering and handling
 */
const NOTIFICATION_CATEGORIES = {
  AUCTION: 'auction',
  PAYMENT: 'payment',
  DELIVERY: 'delivery',
  SYSTEM: 'system',
  USER: 'user'
};

/**
 * Specific notification types within each category
 */
const NOTIFICATION_TYPES = {
  // Auction related
  AUCTION_BID_PLACED: 'auction_bid_placed',
  AUCTION_BID_OUTBID: 'auction_bid_outbid',
  AUCTION_WON: 'auction_won',
  AUCTION_ENDED: 'auction_ended',
  AUCTION_PAYMENT_NEEDED: 'auction_payment_needed',
  
  // Payment related
  PAYMENT_SUCCESSFUL: 'payment_successful',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYOUT_INITIATED: 'payout_initiated',
  PAYOUT_COMPLETED: 'payout_completed',
  
  // Delivery related
  DELIVERY_SCHEDULED: 'delivery_scheduled',
  DELIVERY_UPDATED: 'delivery_updated',
  DELIVERY_COMPLETED: 'delivery_completed',
  
  // System notifications
  SYSTEM_MAINTENANCE: 'system_maintenance',
  SYSTEM_UPDATE: 'system_update',
  
  // User related
  USER_WELCOME: 'user_welcome',
  USER_VERIFICATION: 'user_verification'
};

/**
 * Delivery channels for notifications
 */
const DELIVERY_CHANNELS = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push'
};

const NotificationSchema = new mongoose.Schema({
  // The user who will receive the notification
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Basic notification content
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  message: {
    type: String,
    required: true,
    trim: true
  },

  // Classification fields
  category: {
    type: String,
    enum: Object.values(NOTIFICATION_CATEGORIES),
    required: true,
    index: true
  },

  type: {
    type: String,
    enum: Object.values(NOTIFICATION_TYPES),
    required: true,
    index: true
  },

  priority: {
    type: String,
    enum: Object.values(PRIORITY_LEVELS),
    default: PRIORITY_LEVELS.MEDIUM,
    index: true
  },

  // Delivery configuration
  channels: [{
    type: String,
    enum: Object.values(DELIVERY_CHANNELS),
    default: [DELIVERY_CHANNELS.IN_APP]
  }],

  // Status tracking
  status: {
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date
    },
    deliveredChannels: [{
      channel: String,
      deliveredAt: Date,
      success: Boolean,
      errorMessage: String
    }]
  },

  // Action configuration
  action: {
    type: {
      type: String,
      enum: ['link', 'button', 'modal'],
      required: false
    },
    text: String,
    url: String,
    data: mongoose.Schema.Types.Mixed
  },

  // Reference to related entities
  reference: {
    model: {
      type: String,
      enum: ['Auction', 'Transaction', 'Payment', 'User'],
      required: false
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    }
  },

  // Additional metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Expiration date for temporary notifications
  expiresAt: {
    type: Date,
    index: true,
    expires: 0 // This enables TTL index
  }
}, {
  timestamps: true
});

// Indexes
NotificationSchema.index({ createdAt: -1 });
NotificationSchema.index({ 'status.read': 1, createdAt: -1 });
NotificationSchema.index({ user: 1, category: 1, createdAt: -1 });

// Instance methods
NotificationSchema.methods.markAsRead = async function() {
  this.status.read = true;
  this.status.readAt = new Date();
  return this.save();
};

NotificationSchema.methods.markAsDelivered = async function(channel, success, errorMessage = null) {
  this.status.deliveredChannels.push({
    channel,
    deliveredAt: new Date(),
    success,
    errorMessage
  });
  return this.save();
};

// Static methods
NotificationSchema.statics.findUnreadByUser = function(userId) {
  return this.find({
    user: userId,
    'status.read': false
  }).sort({ createdAt: -1 });
};

NotificationSchema.statics.markAllAsRead = async function(userId) {
  return this.updateMany(
    { user: userId, 'status.read': false },
    { 
      $set: { 
        'status.read': true,
        'status.readAt': new Date()
      }
    }
  );
};

// Export constants along with the model
module.exports = {
  NotificationModel: mongoose.model('Notification', NotificationSchema),
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  PRIORITY_LEVELS,
  DELIVERY_CHANNELS
};