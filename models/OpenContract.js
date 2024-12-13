const mongoose = require('mongoose');

const OpenContractSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productType: { type: String, required: true },
  productCategory: { type: String, required: true },
  quantity: { type: Number, required: true },
  maxPrice: { type: Number, required: true },
  endTime: { type: Date, required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['open', 'pending_fulfillment', 'fulfilled', 'closed', 'expired', 'pending_payment', 'payment_complete'],
    default: 'open' 
  },
  deliveryMethod: {
    type: String,
    enum: ['buyer_pickup', 'farmer_delivery', 'third_party'],
    required: true
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
    paidAt: Date
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
      deliveryMethod: {
        type: String,
        enum: ['buyer_pickup', 'farmer_delivery', 'third_party'],
        required: true
      },
      deliveryFee: Number,
      estimatedDeliveryDate: Date,
      fulfilledAt: { type: Date, default: Date.now }
    }
  ],
  winningFulfillment: {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity: { type: Number },
    price: { type: Number },
    deliveryMethod: {
      type: String,
      enum: ['buyer_pickup', 'farmer_delivery', 'third_party']
    },
    deliveryFee: Number,
    estimatedDeliveryDate: Date,
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

// Calculate total amount including delivery fee
OpenContractSchema.methods.calculateTotalAmount = function() {
  if (!this.winningFulfillment) return 0;
  
  const subtotal = this.winningFulfillment.price * this.winningFulfillment.quantity;
  const deliveryFee = this.winningFulfillment.deliveryFee || 0;
  const processingFee = subtotal * 0.05; // 5% processing fee
  
  return subtotal + deliveryFee + processingFee;
};

module.exports = mongoose.model('OpenContract', OpenContractSchema);
