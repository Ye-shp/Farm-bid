const mongoose = require('mongoose');

const openContractSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productType: {
    type: String,
    required: true
  },
  productCategory: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  maxPrice: {
    type: Number,
    required: true,
    min: 0
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'fulfilled', 'completed', 'cancelled'],
    default: 'open'
  },
  deliveryMethod: {
    type: String,
    enum: ['buyer_pickup', 'farmer_delivery', 'third_party'],
    default: 'buyer_pickup'
  },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  paymentDetails: {
    transactionId: String,
    amount: Number,
    processingFee: Number,
    paymentDate: Date,
    paymentMethod: String
  },
  fulfillments: [{
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    deliveryMethod: {
      type: String,
      enum: ['buyer_pickup', 'farmer_delivery', 'third_party'],
      default: 'buyer_pickup'
    },
    deliveryFee: {
      type: Number,
      default: 0
    },
    estimatedDeliveryDate: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  notifiedFarmers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for efficient querying of open contracts
openContractSchema.index({ status: 1, productType: 1, productCategory: 1 });

// Method to check if contract is expired
openContractSchema.methods.isExpired = function() {
  return new Date() > this.endTime;
};

// Method to check if contract can be fulfilled
openContractSchema.methods.canBeFulfilled = function() {
  return this.status === 'open' && !this.isExpired();
};

// Calculate total amount including delivery fee
openContractSchema.methods.calculateTotalAmount = function() {
  if (!this.fulfillments || !this.fulfillments.length) return 0;
  
  const fulfillment = this.fulfillments[0];
  const subtotal = fulfillment.price * this.quantity;
  const deliveryFee = fulfillment.deliveryFee || 0;
  const processingFee = subtotal * 0.05; // 5% processing fee
  
  return subtotal + deliveryFee + processingFee;
};

module.exports = mongoose.model('OpenContract', openContractSchema);
