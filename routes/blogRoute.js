// routes/blogRoutes.js

const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');

// GET all blogs
router.get('/', blogController.getAllBlogs);

// GET a single blog by ID
router.get('/:id', blogController.getBlogById);

// POST a new blog
router.post('/', blogController.createBlog);

module.exports = router;
