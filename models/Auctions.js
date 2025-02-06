const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product',  
    required: true,
    index: true  
  },
  startingPrice: { 
    type: Number, 
    required: true 
  },
  auctionQuantity: {
    type: Number,
    required: true, 
  },
  Delivery: {
    type :  Boolean,
    required: true, 
  }, 
  endTime: { 
    type: Date, 
    required: true,
    index: true  
  },
  status: { 
    type: String, 
    required: true,
    enum: ['active', 'ended'], 
    default: 'active',
    index: true 
  }, 
  bids: [{
    amount: { 
      type: Number, 
      required: true 
    },
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true
    },
    time: { 
      type: Date, 
      default: Date.now 
    }
  }],
  winningBid: {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    amount: { 
      type: Number 
    },
    time: { 
      type: Date 
    }
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  paymentIntentId: {
    type: String
  },
  acceptedAt: {
    type: Date
  }
}, {
  timestamps: true  
});

// Compound index for querying active auctions that need to be ended
AuctionSchema.index({ status: 1, endTime: 1 });

module.exports = mongoose.model('Auction', AuctionSchema);