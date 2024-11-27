const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['farmer', 'buyer'] },
  blogs: [{type: mongoose.Schema.Types.ObjectId, ref:'Blog'}],
  phone: {type: String, required: true,
    validate: {
      validator: function(v) {
        return validator.isMobilePhone(v, 'any');
      },
      message: props => `${props.value} is not a valid phone number`
    }
  },
  
  location: {
    latitude: { type: Number, required: false },
    longitude: { type: Number, required: false }
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
  deliveryAvailable: { type: Boolean, default: false},
  followers: [{type:mongoose.Schema.Types.ObjectId, ref: 'User'}],
  following :[{type:mongoose.Schema.Types.ObjectId, ref: 'User'}],

  stripeAccountId: {type: String, required:false },
  isStripeAccountCreated: {type: Boolean, default :false}, 



});

module.exports = mongoose.model('User', UserSchema);
