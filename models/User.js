const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['farmer', 'buyer'] },
  
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
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
      description: { type: String }
    }
  ],

  wholesaleAvailable: { type: Boolean, default: false }, 
  deliveryAvailable: { type: Boolean, default: false},
  followers: [{type:mongoose.Schema.Types.ObjectId, ref: 'User'}],
  following :[{type:mongoose.Schema.Types.ObjectId, ref: 'User'}]
});

module.exports = mongoose.model('User', UserSchema);
