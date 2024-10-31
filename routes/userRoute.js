const express = require('express');
const User = require('../models/User'); // Adjust the path as needed
const { authMiddleware } = require('../middleware/authMiddleware'); // Add your token middleware
const router = express.Router();

// GET /api/users/:userId - Get user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password') // Exclude password for security
      .populate('followers', 'email')
      .populate('following', 'email');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:userId/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find({ user: req.params.userId });
    if (!blogs) {
      return res.status(404).json({ message: 'No blogs found for this user' });
    }
    res.status(200).json(blogs);
  } catch (error) {
    console.error('Error fetching user blogs:', error);
    res.status(500).json({ message: 'Server error while fetching user blogs' });
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

// POST /api/users/follow/:id - Follow a user
router.post('/follow/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // ID of the user to follow
    const userId = req.user.id; // ID of the logged-in user (from auth middleware)

    if (userId === id) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const user = await User.findById(userId);
    const userToFollow = await User.findById(id);

    if (!user || !userToFollow) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Add the userToFollow to the logged-in user's following list if not already followed
    if (!user.following.includes(id)) {
      user.following.push(id);
      userToFollow.followers.push(userId);
      await user.save();
      await userToFollow.save();
    }

    res.status(200).json({ message: 'Followed successfully', user });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({ message: 'Error following user', error });
  }
});

// POST /api/users/unfollow/:id - Unfollow a user
router.post('/unfollow/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params; // ID of the user to unfollow
    const userId = req.user.id; // ID of the logged-in user (from auth middleware)

    if (userId === id) {
      return res.status(400).json({ message: 'You cannot unfollow yourself.' });
    }

    const user = await User.findById(userId);
    const userToUnfollow = await User.findById(id);

    if (!user || !userToUnfollow) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Remove the userToUnfollow from the logged-in user's following list
    user.following = user.following.filter(followId => followId.toString() !== id);
    userToUnfollow.followers = userToUnfollow.followers.filter(followerId => followerId.toString() !== userId);

    await user.save();
    await userToUnfollow.save();

    res.status(200).json({ message: 'Unfollowed successfully', user });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({ message: 'Error unfollowing user', error });
  }
});

module.exports = router;
