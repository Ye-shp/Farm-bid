const express = require('express');
const { createBlog, getBlogs, getBlogById, postComment } = require('../controllers/blogController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', authMiddleware, createBlog); // Authenticated users can create blogs
router.get('/', getBlogs); // Anyone can view blogs
router.get('/:id', getBlogById); // Anyone can view a specific blog
router.post('/:id/comments', authMiddleware, postComment); // Authenticated users can post comments

module.exports = router;
