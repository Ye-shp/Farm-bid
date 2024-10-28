const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  startingPrice: { type: Number, required: true },  // Starting price for the auction
  endTime: { type: Date, required: true },  // End time of the auction
  status: { type : String, required: true, default: 'active'}, 
  bids: [{
    amount: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }]
});

module.exports = mongoose.model('Auction', AuctionSchema);
