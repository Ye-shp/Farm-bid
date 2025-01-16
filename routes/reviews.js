const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const auth = require('../middleware/authMiddleware');

// Get all reviews for a user
router.get('/:userId', (req, res, next) => {
  auth(req, res, next);
}, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.params.userId })
      .populate('reviewer', 'username profileImage')
      .sort({ createdAt: -1 });

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    res.json({
      reviews,
      averageRating: Math.round(averageRating * 2) / 2 // Round to nearest 0.5
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a new review
router.post('/:userId', (req, res, next) => {
  auth(req, res, next);
}, async (req, res) => {
  try {
    // Check if user is trying to review themselves
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot review yourself" });
    }

    // Check if user has already reviewed this profile
    const existingReview = await Review.findOne({
      reviewer: req.user._id,
      reviewedUser: req.params.userId
    });

    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this profile" });
    }

    const review = new Review({
      reviewer: req.user._id,
      reviewedUser: req.params.userId,
      rating: req.body.rating,
      content: req.body.content
    });

    const savedReview = await review.save();
    await savedReview.populate('reviewer', 'username profileImage');

    res.status(201).json(savedReview);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a review
router.put('/:reviewId', (req, res, next) => {
  auth(req, res, next);
}, async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      reviewer: req.user._id
    });

    if (!review) {
      return res.status(404).json({ message: "Review not found or you're not authorized to edit it" });
    }

    review.rating = req.body.rating || review.rating;
    review.content = req.body.content || review.content;

    const updatedReview = await review.save();
    await updatedReview.populate('reviewer', 'username profileImage');

    res.json(updatedReview);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a review
router.delete('/:reviewId', (req, res, next) => {
  auth(req, res, next);
}, async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      reviewer: req.user._id
    });

    if (!review) {
      return res.status(404).json({ message: "Review not found or you're not authorized to delete it" });
    }

    await review.remove();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
