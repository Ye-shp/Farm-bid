const express = require('express');
const { createBlog, getBlogs, getBlogById, addComment } = require('../controllers/blogController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Create a blog
router.post('/create', authMiddleware, createBlog);

// Get all blogs
router.get('/', getBlogs);

// Get blog by ID (with comments)
router.get('/:id', getBlogById);

// Add a comment to a blog post
router.post('/:id/comment', authMiddleware, blogController.addComment);

module.exports = router;
