// models/Payout.js
const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number, // Amount in cents
  date: Date,
  stripePayoutId: String,
});

module.exports = mongoose.model('Payout', payoutSchema);
 