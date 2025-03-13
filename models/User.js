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
      lat: { 
        type: Number, 
        required: true,
        min: -90,
        max: 90,
        validate: {
          validator: Number.isFinite,
          message: '{VALUE} is not a valid latitude'
        }
      },
      lng: { 
        type: Number, 
        required: true,
        min: -180,
        max: 180,
        validate: {
          validator: Number.isFinite,
          message: '{VALUE} is not a valid longitude'
        }
      }
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
  deliveryAvailable: { type: Boolean, default: false },
  followers: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
  following: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],

  // Payment information
  stripeAccountId: { type: String },
  stripeCustomerId: { type: String },
  paymentMethods: [{
    type: { type: String, enum: ['card', 'bank_account'] },
    isDefault: { type: Boolean, default: false },
    last4: String,
    brand: String, // for cards
    expiryMonth: Number, // for cards
    expiryYear: Number, // for cards
    stripePaymentMethodId: String
  }],
  
  // Payment settings for recurring contracts
  recurringPaymentSettings: {
    autoPayEnabled: { type: Boolean, default: false },
    defaultPaymentMethodId: { type: String },
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      advanceNoticeDays: { type: Number, default: 3 }
    }
  },
  
  // Business verification status
  verification: {
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    documents: [String]
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
