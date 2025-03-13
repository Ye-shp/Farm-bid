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
  // Recurring payment fields
  isRecurring: {
    type: Boolean,
    default: false
  },
  parentContractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OpenContract'
  },
  recurringInstance: {
    instanceNumber: Number,
    isAutomatic: {
      type: Boolean,
      default: false
    }
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
  // For contract transactions
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OpenContract'
  },
  fulfillmentId: {
    type: mongoose.Schema.Types.ObjectId
  },
  // For auction transactions
  auctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Auction'
  },
  bidId: {
    type: mongoose.Schema.Types.ObjectId
  },
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date 
  }
}, {
  timestamps: true
});

// Add index for querying transactions by user and payment intent
TransactionSchema.index({ buyer: 1, status: 1 });
TransactionSchema.index({ seller: 1, status: 1 });
TransactionSchema.index({ 'paymentIntent.stripeId': 1 });
TransactionSchema.index({ sourceType: 1, sourceId: 1 });

// Pre-save hook to update the updatedAt field
TransactionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to update payment status
TransactionSchema.methods.updatePaymentStatus = async function(status, error = null) {
  this.paymentIntent.status = status;
  
  // Add attempt to history
  if (!this.paymentIntent.attempts) {
    this.paymentIntent.attempts = [];
  }
  
  const attempt = {
    timestamp: new Date(),
    status: status
  };
  
  if (error) {
    attempt.error = typeof error === 'string' ? error : JSON.stringify(error);
  }
  
  this.paymentIntent.attempts.push(attempt);
  this.paymentIntent.lastAttempt = new Date();
  
  // Update overall transaction status
  if (status === 'succeeded') {
    this.status = 'payment_held';
  } else if (status === 'failed') {
    this.status = 'failed';
  }
  
  await this.save();
  return this;
};

// Method to calculate payout amount (after fees)
TransactionSchema.methods.calculatePayoutAmount = function() {
  const totalFees = this.fees.platform + this.fees.processing;
  return this.amount - totalFees;
};

// Method to mark transaction as completed
TransactionSchema.methods.markAsCompleted = async function() {
  this.status = 'completed';
  await this.save();
  return this;
};

// Method to mark transaction as disputed
TransactionSchema.methods.markAsDisputed = async function(reason) {
  this.status = 'disputed';
  this.disputeReason = reason;
  await this.save();
  return this;
};

// Method to mark transaction as refunded
TransactionSchema.methods.markAsRefunded = async function() {
  this.status = 'refunded';
  await this.save();
  return this;
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