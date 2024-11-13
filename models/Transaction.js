// models/Transaction.js
const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  // Reference to either Auction or OpenContract
  sourceType: { 
    type: String, 
    required: true,
    enum: ['auction', 'contract']
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'sourceType'
  },
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  seller: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'payment_held', 'delivered', 'completed', 'disputed', 'refunded'],
    default: 'pending'
  },
  paymentIntent: {
    stripeId: String,
    status: String
  },
  delivery: {
    method: {
      type: String,
      enum: ['pickup', 'delivery'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    address: String,
    scheduledTime: Date,
    completedTime: Date
  },
  messages: [{
    sender: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    content: { 
      type: String, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    }
  }]
}, {
  timestamps: true
});

// Add index for querying transactions by user
TransactionSchema.index({ buyer: 1, status: 1 });
TransactionSchema.index({ seller: 1, status: 1 });

// Update to Message schema (replaces chat functionality)
const MessageSchema = new mongoose.Schema({
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Add to existing NotificationSchema types
const notificationTypes = ['bid', 'payment', 'fulfillment', 'delivery', 'message', 'other'];