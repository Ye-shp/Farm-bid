const express = require('express');
const { createBlog, getBlogs, getBlogById, addCommentToBlogPost, likeBlogPost, getFeaturedFarms } = require('../controllers/blogController');
const { authMiddleware } = require('../middleware/authMiddleware');
const blogController = require('../controllers/blogController');

const router = express.Router();

// Create a blog
router.post('/create', authMiddleware, createBlog);

// Get all blogs
router.get('/', getBlogs);

// Get blog by ID (with comments and view increment)
router.get('/:id', getBlogById);

// Add a comment to a blog post
router.post('/:id/comment', authMiddleware, addCommentToBlogPost);

// Like or unlike a blog post
router.post('/:id/like', authMiddleware, likeBlogPost);

// Get featured farms (based on blog engagement)
router.get('/featured-farms', getFeaturedFarms);


// Get all blogs by a specific user
router.get('/user/:userId', async (req, res) => {
    try {
      const blogs = await Blog.find({ user: req.params.userId }).sort({ createdAt: -1 });
      res.json(blogs);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });
  
module.exports = router;
