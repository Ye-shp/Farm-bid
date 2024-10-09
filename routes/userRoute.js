const express = require('express');
const User = require('../models/User'); // Adjust the path as needed
const {authMiddleware} = require('../middleware/authMiddleware'); // Add your token middleware
const router = express.Router();

// GET /api/users/:userId - Get user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:userId - Update user profile
router.put('/:userId', authMiddleware, async (req, res) => {
  try {
    // Verify that the authenticated user matches the profile being updated
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'You are not authorized to edit this profile.' });
    }

    const { wholesaleAvailable, description, socialMedia } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { wholesaleAvailable, description, socialMedia },
      { new: true }
    );

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

module.exports = router;
