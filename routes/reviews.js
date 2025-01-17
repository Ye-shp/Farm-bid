const express = require('express');
const router = express.Router();
const Review = require('../models/Review');

// Get all reviews for a user
router.get('/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewedUser: req.params.userId })
      .populate('reviewer', 'username profileImage')
      .sort({ createdAt: -1 });

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    res.json({
      reviews: reviews || [],
      averageRating: Math.round(averageRating * 2) / 2 // Round to nearest 0.5
    });
  } catch (error) {
    console.error('Error in GET reviews:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new review
router.post('/:userId', async (req, res) => {
  try {
    // For now, we'll use a mock user ID for testing
    const mockUserId = '123456789012345678901234'; // This should be a valid ObjectId

    const review = new Review({
      reviewer: mockUserId,
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
router.put('/:reviewId', async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
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
router.delete('/:reviewId', async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    await review.deleteOne();
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    console.error('Error in DELETE review:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
