const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reviewedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxLength: 1000
  }
}, {
  timestamps: true
});

// Prevent multiple reviews from the same user
reviewSchema.index({ reviewer: 1, reviewedUser: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
