const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  stripePaymentMethodId: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  card: {
    brand: {
      type: String,
      required: true
    },
    last4: {
      type: String,
      required: true
    },
    exp_month: {
      type: Number,
      required: true
    },
    exp_year: {
      type: Number,
      required: true
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('paymentMethod', PaymentMethodSchema); 