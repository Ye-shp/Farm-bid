// models/Payout.js
const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending'
  },
  stripePayoutId: {
    type: String,
    required: true
  },
  processedAt: {
    type: Date
  },
  error: {
    message: String,
    code: String,
    timestamp: Date
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
});

// Add indexes
PayoutSchema.index({ userId: 1, status: 1 });
PayoutSchema.index({ stripePayoutId: 1 }, { unique: true });
PayoutSchema.index({ transaction: 1 }, { unique: true });

// Instance methods
PayoutSchema.methods.updateStatus = async function(status, error = null) {
  this.status = status;
  if (error) {
    this.error = {
      message: error.message,
      code: error.code,
      timestamp: new Date()
    };
  }
  if (status === 'paid') {
    this.processedAt = new Date();
  }
  return this.save();
};

// Static methods
PayoutSchema.statics.findByStripeId = function(stripePayoutId) {
  return this.findOne({ stripePayoutId });
};

PayoutSchema.statics.findByTransaction = function(transactionId) {
  return this.findOne({ transaction: transactionId });
};

const Payout = mongoose.model('Payout', PayoutSchema);

module.exports = { Payout };