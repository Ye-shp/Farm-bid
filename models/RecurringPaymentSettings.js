const mongoose = require('mongoose');

const RecurringPaymentSettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  autoPayEnabled: {
    type: Boolean,
    default: false
  },
  notificationPreferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    smsNotifications: {
      type: Boolean,
      default: false
    },
    advanceNoticeDays: {
      type: Number,
      default: 3,
      min: 1,
      max: 30
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('recurringPaymentSettings', RecurringPaymentSettingsSchema); 