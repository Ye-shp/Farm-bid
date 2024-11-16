// routes/users.js

const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
const router = express.Router();

// GET /api/users/:userId - Get user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password')
      .populate('followers', 'username email')
      .populate('following', 'username email')
      .populate('partners', 'username email');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching user data:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:userId - Update user profile
router.put('/:userId', authMiddleware, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'You are not authorized to edit this profile.' });
    }

    const {
      wholesaleAvailable,
      deliveryAvailable,
      description,
      socialMedia,
      partners,
      location,
    } = req.body;

    const updatedFields = {
      wholesaleAvailable,
      deliveryAvailable,
      description,
      socialMedia,
      partners,
      location,
    };

    // Remove undefined fields
    Object.keys(updatedFields).forEach(
      key => updatedFields[key] === undefined && delete updatedFields[key]
    );

    const updatedUser = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: updatedFields },
      { new: true }
    );

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Server error while updating profile' });
  }
});

// POST /api/users/:userId/follow - Follow a user
router.post('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params; // ID of the user to follow
    const loggedInUserId = req.user.id; // ID of the logged-in user

    if (loggedInUserId === userId) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const user = await User.findById(loggedInUserId);
    const userToFollow = await User.findById(userId);

    if (!user || !userToFollow) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.following.includes(userId)) {
      user.following.push(userId);
      userToFollow.followers.push(loggedInUserId);
      await user.save();
      await userToFollow.save();
    } else {
      return res.status(400).json({ message: 'You are already following this user.' });
    }

    res.status(200).json({ message: 'Followed successfully' });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ message: 'Error following user', error });
  }
});

// POST /api/users/:userId/unfollow - Unfollow a user
router.post('/:userId/unfollow', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params; // ID of the user to unfollow
    const loggedInUserId = req.user.id; // ID of the logged-in user

    if (loggedInUserId === userId) {
      return res.status(400).json({ message: 'You cannot unfollow yourself.' });
    }

    const user = await User.findById(loggedInUserId);
    const userToUnfollow = await User.findById(userId);

    if (!user || !userToUnfollow) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.following.includes(userId)) {
      user.following = user.following.filter(followId => followId.toString() !== userId);
      userToUnfollow.followers = userToUnfollow.followers.filter(followerId => followerId.toString() !== loggedInUserId);
      await user.save();
      await userToUnfollow.save();
    } else {
      return res.status(400).json({ message: 'You are not following this user.' });
    }

    res.status(200).json({ message: 'Unfollowed successfully' });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Error unfollowing user', error });
  }
});

module.exports = router;
