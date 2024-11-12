const mongoose = require('mongoose');

const AuctionSchema = new mongoose.Schema({
  product: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true,
    index: true  // Add index for faster product lookups
  },
  startingPrice: { 
    type: Number, 
    required: true 
  },
  endTime: { 
    type: Date, 
    required: true,
    index: true  // Add index to optimize expired auction queries
  },
  status: { 
    type: String, 
    required: true,
    enum: ['active', 'ended'],  // Restrict to valid values
    default: 'active',
    index: true  // Add index for status filtering
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
  paymentIntentId: { 
    type: String 
  }
}, {
  timestamps: true  // Adds createdAt and updatedAt fields
});

// Compound index for querying active auctions that need to be ended
AuctionSchema.index({ status: 1, endTime: 1 });

module.exports = mongoose.model('Auction', AuctionSchema);