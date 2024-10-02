const express = require('express');
const { createBlog, getBlogs, getBlogById, addComment } = require('../controllers/blogController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { createBlogPost, addCommentToBlogPost, getBlogPost, getBlogPosts } = require('../../farm-bid-frontend/src/Services/blogs');

const router = express.Router();

// Create a blog
router.post('/create', authMiddleware, createBlogPost);

// Get all blogs
router.get('/', getBlogPosts);

// Get blog by ID (with comments)
router.get('/:id', getBlogPost);

// Add a comment to a blog post
router.post('/:id/comment', authMiddleware, addCommentToBlogPost);

module.exports = router;
