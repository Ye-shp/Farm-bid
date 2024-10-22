// models/FeaturedFarms.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const featuredFarmsSchema = new Schema({
  farms: [
    {
      _id: { type: Schema.Types.ObjectId, ref: 'User' }, // Reference to user (farmer)
      totalEngagement: { type: Number, required: true } // Engagement score
    }
  ],
  updatedAt: { type: Date, default: Date.now } // Timestamp for the last update
});

// Automatically update 'updatedAt' before saving
featuredFarmsSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('FeaturedFarms', featuredFarmsSchema);
