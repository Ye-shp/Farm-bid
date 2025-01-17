const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const { authMiddleware } = require('../middleware/authMiddleware');

// Get all reviews for a user (public endpoint)
router.get('/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.params.userId })
      .populate('reviewer', 'username profileImage')
      .sort({ createdAt: -1 });

    // Filter out reviews with invalid reviewers (where populate failed)
    const validReviews = reviews.filter(review => review.reviewer && review.reviewer.username);

    // Calculate average rating using only valid reviews
    const totalRating = validReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = validReviews.length > 0 ? totalRating / validReviews.length : 0;

    res.json({
      reviews: validReviews,
      averageRating: Math.round(averageRating * 2) / 2 // Round to nearest 0.5
    });
  } catch (error) {
    console.error('Error in GET reviews:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new review
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    // Check if user is trying to review themselves
    if (req.params.userId === req.user.id) {
      return res.status(400).json({ message: "You cannot review yourself" });
    }

    // Check if user has already reviewed this profile
    const existingReview = await Review.findOne({
      reviewer: req.user.id,
      reviewedUser: req.params.userId
    });

    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this profile" });
    }

    const review = new Review({
      reviewer: req.user.id,
      reviewedUser: req.params.userId,
      rating: req.body.rating,
      content: req.body.content
    });

    const savedReview = await review.save();
    await savedReview.populate('reviewer', 'username profileImage');

    res.status(201).json(savedReview);
  } catch (error) {
    console.error('Error in POST review:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update a review
router.put('/:reviewId', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      reviewer: req.user.id
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
    console.error('Error in PUT review:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete a review
router.delete('/:reviewId', authMiddleware, async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      reviewer: req.user.id
    });

    if (!review) {
      return res.status(404).json({ message: "Review not found or you're not authorized to delete it" });
    }

    await review.deleteOne();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error('Error in DELETE review:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
