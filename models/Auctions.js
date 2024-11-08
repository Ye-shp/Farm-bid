const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  startingPrice: { type: Number, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, required: true }, 
  bids: [
    {
      amount: { type: Number, required: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  winningBid: {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number }
  },
  paymentIntentId: { type: String } // Reference to payment intent for winning bid
});

module.exports = mongoose.model('Auction', AuctionSchema);
