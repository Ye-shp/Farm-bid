// models/Payout.js
const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
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
  currency: {
    type: String,
    default: 'usd'
  },
  stripePayoutId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending'
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
payoutSchema.index({ userId: 1, status: 1 });
payoutSchema.index({ stripePayoutId: 1 }, { unique: true });
payoutSchema.index({ transaction: 1 }, { unique: true });

// Instance methods
payoutSchema.methods.updateStatus = async function(status, error = null) {
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
payoutSchema.statics.findByStripeId = function(stripePayoutId) {
  return this.findOne({ stripePayoutId });
};

payoutSchema.statics.findByTransaction = function(transactionId) {
  return this.findOne({ transaction: transactionId });
};

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;