const mongoose = require('mongoose');

const OpenContractSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productType: { type: String, required: true }, // e.g., 'Honey', 'Apples', etc.
  productCategory: { type: String, required: true }, // Added to help with matching farmers
  quantity: { type: Number, required: true },
  maxPrice: { type: Number, required: true },
  endTime: { type: Date, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['open', 'pending_fulfillment', 'fulfilled', 'closed', 'expired'],
    default: 'open' 
  },
  fulfillments: [
    {
      farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
      },
      fulfilledAt: { type: Date, default: Date.now }
    }
  ],
  winningFulfillment: {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity: { type: Number },
    price: { type: Number },
    acceptedAt: { type: Date }
  },
  notifiedFarmers: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }]
}, {
  timestamps: true
});

// Add index for efficient querying of open contracts
OpenContractSchema.index({ status: 1, productType: 1, productCategory: 1 });

// Method to check if contract is expired
OpenContractSchema.methods.isExpired = function() {
  return new Date() > this.endTime;
};

// Method to check if contract can be fulfilled
OpenContractSchema.methods.canBeFulfilled = function() {
  return this.status === 'open' && !this.isExpired();
};

module.exports = mongoose.model('OpenContract', OpenContractSchema);
