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
  fees: {
    platform: {
      type: Number,
      required: true,
      default: 0
    },
    processing: {
      type: Number,
      required: true,
      default: 0
    }
  },
  status: {
    type: String,
    required: true,
    enum: [
      'pending',          // Initial state
      'processing',       // Payment is being processed
      'payment_held',     // Payment successful but held
      'delivered',        // Product delivered
      'completed',        // Transaction complete
      'disputed',         // In dispute
      'refunded',         // Payment refunded
      'failed'            // Payment failed
    ],
    default: 'pending'
  },
  paymentIntent: {
    stripeId: String,
    status: String,
    attempts: [{
      timestamp: Date,
      status: String,
      error: String
    }],
    lastAttempt: Date
  },
  payout: {
    stripeId: String,
    status: String,
    amount: Number,
    processedAt: Date
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
  }],
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Add index for querying transactions by user and payment intent
TransactionSchema.index({ buyer: 1, status: 1 });
TransactionSchema.index({ seller: 1, status: 1 });
TransactionSchema.index({ 'paymentIntent.stripeId': 1 });
TransactionSchema.index({ sourceType: 1, sourceId: 1 });

// Instance methods
TransactionSchema.methods.updatePaymentStatus = async function(status, error = null) {
  this.paymentIntent.status = status;
  this.paymentIntent.attempts.push({
    timestamp: new Date(),
    status,
    error: error?.message
  });
  this.paymentIntent.lastAttempt = new Date();
  
  // Update transaction status based on payment status
  switch(status) {
    case 'succeeded':
      this.status = 'payment_held';
      break;
    case 'failed':
      this.status = 'failed';
      break;
    case 'processing':
      this.status = 'processing';
      break;
  }
  
  return this.save();
};

TransactionSchema.methods.calculatePayoutAmount = function() {
  const platformFee = this.fees.platform;
  const processingFee = this.fees.processing;
  return this.amount - platformFee - processingFee;
};

// Static methods
TransactionSchema.statics.findByPaymentIntent = function(paymentIntentId) {
  return this.findOne({ 'paymentIntent.stripeId': paymentIntentId });
};

TransactionSchema.statics.findBySource = function(sourceType, sourceId) {
  return this.findOne({ sourceType, sourceId });
};

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

const Transaction = mongoose.model('Transaction', TransactionSchema);
const Message = mongoose.model('Message', MessageSchema);

module.exports = { Transaction, Message };