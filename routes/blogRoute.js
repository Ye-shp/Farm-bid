const express = require('express');
const { createBlog, getBlogs, getBlogById, addCommentToBlogPost, likeBlogPost, getFeaturedFarms, getUserBlogs } = require('../controllers/blogController');
const { authMiddleware } = require('../middleware/authMiddleware');
const blogController = require('../controllers/blogController');
const Blog = require('../models/Blog'); // Added Blog model import

const router = express.Router();

// Create a blog
router.post('/create', authMiddleware, createBlog);

// Get all blogs
router.get('/', getBlogs);

// Get featured farms (based on blog engagement)
// Apparently order matters inorder for express to match 
router.get('/featured-farms', getFeaturedFarms);

// Get blog by ID (with comments and view increment)
router.get('/:id', getBlogById);

// Add a comment to a blog post
router.post('/:id/comment', authMiddleware, addCommentToBlogPost);

// Like or unlike a blog post
router.post('/:id/like', authMiddleware, likeBlogPost);

// Get all blogs by a specific user
router.get('/user/:userId', getUserBlogs); // Moved route handler to controller

module.exports = router;
