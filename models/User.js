const mongoose = require('mongoose');
const validator = require ('validator');

const UserSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['farmer', 'buyer'] },
  blogs: [{type: mongoose.Schema.Types.ObjectId, ref:'Blog'}],
  phone: {
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return validator.isMobilePhone(v, 'any');
      },
      message: props => `${props.value} is not a valid phone number`
    }
  },
  
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    }
  },

  deliveryOptions: {
    providesDelivery: { type: Boolean, default: false },
    deliveryRadius: { type: Number }, // in miles
    deliveryFee: {
      base: { type: Number }, // base delivery fee
      perMile: { type: Number } // additional fee per mile
    },
    minimumOrderForDelivery: { type: Number },
    thirdPartyDelivery: { type: Boolean, default: false },
    pickupAvailable: { type: Boolean, default: true }
  },

  socialMedia: {
    instagram: { type: String },
    facebook: { type: String },
    tiktok: { type: String }
  },
  description: { type: String },
  products: [
    {
      name: { type: String, required: true },
      description: { type: String },
      price: { type: Number, required: true }
    }
  ],

  partners: [
    {
      name: { type: String, required: true },
      location: { type: String, required: true },
      description: { type: String, required: true}, 
    }
  ],

  wholesaleAvailable: { type: Boolean, default: false },
  followers: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
  following: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],

  // Payment information
  stripeAccountId: { type: String },
  paymentMethods: [{
    type: { type: String, enum: ['card', 'bank_account'] },
    isDefault: { type: Boolean, default: false },
    last4: String,
    brand: String, // for cards
    expiryMonth: Number, // for cards
    expiryYear: Number, // for cards
    stripePaymentMethodId: String
  }],
  
  // Business verification status
  verification: {
    isVerified: { type: Boolean, default: false },
    documents: [{
      type: { type: String, enum: ['id', 'address_proof', 'business_license'] },
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      uploadedAt: Date
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
