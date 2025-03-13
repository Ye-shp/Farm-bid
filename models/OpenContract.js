const mongoose = require('mongoose');

const openContractSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerLocation: {
    coordinates: {
      lat: Number,
      lng: Number
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    }
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
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringFrequency: {
    type: String,
    enum: ['weekly', 'biweekly', 'monthly', 'quarterly'],
    required: function() { return this.isRecurring; }
  },
  recurringEndDate: {
    type: Date,
    required: function() { return this.isRecurring; }
  },
  nextDeliveryDate: {
    type: Date
  },
  recurringInstances: [{
    instanceNumber: Number,
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ['scheduled', 'active', 'fulfilled', 'completed', 'cancelled'],
      default: 'scheduled'
    },
    fulfillmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OpenContract'
    }
  }],
  // Recurring payment settings
  recurringPaymentSettings: {
    autoPayEnabled: {
      type: Boolean,
      default: false
    },
    paymentMethodId: {
      type: String
    },
    notifyBeforeCharge: {
      type: Boolean,
      default: true
    },
    notificationDays: {
      type: Number,
      default: 3
    }
  },
  // Parent contract reference (for recurring instances)
  parentContract: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OpenContract'
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
    farmerLocation: {
      coordinates: {
        lat: Number,
        lng: Number
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
      }
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    notes: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed'],
      default: 'pending'
    },
    deliveryMethod: {
      type: String,
      enum: ['buyer_pickup', 'farmer_delivery', 'third_party'],
      default: 'buyer_pickup'
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0
    },
    estimatedDeliveryDate: Date,
    actualDeliveryDate: Date,
    trackingNumber: String,
    deliveryNotes: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    acceptedAt: Date,
    completedAt: Date
  }],
  winningFulfillment: {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    farmerLocation: {
      coordinates: {
        lat: Number,
        lng: Number
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String
      }
    },
    price: Number,
    deliveryMethod: String,
    deliveryFee: Number,
    acceptedAt: Date,
    completedAt: Date
  },
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
