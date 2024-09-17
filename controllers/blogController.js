// blogController.js

const Blog = require('../models/Blog');

// Create a new blog post
exports.createBlog = async (req, res) => {
  const { title, content } = req.body;

  try {
    // Ensure the user field is correctly set
    const newBlog = new Blog({ 
      title, 
      content, 
      user: req.user.id  // Attach the authenticated user's ID
    });

    await newBlog.save();
    res.status(201).json(newBlog);
  } catch (error) {
    console.error('Error creating blog:', error); // Log the error for debugging
    res.status(500).json({ error: error.message });
  }
};


// Get all blog posts
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a single blog post by ID
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Post a comment on a blog
exports.postComment = async (req, res) => {
  const { text } = req.body;
  
  try {
    const blog = await Blog.findById(req.params.id);
    blog.comments.push({ text });
    await blog.save();
    res.status(201).json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
