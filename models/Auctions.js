const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  bids: [{
    amount: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
});

module.exports = mongoose.model('Auction', AuctionSchema);
