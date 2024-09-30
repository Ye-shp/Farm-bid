const Blog = require('../models/Blog');

// Post a comment to a blog
exports.postComment = async (req, res) => {
  const { content } = req.body;

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    const newComment = {
      user: req.user.id,
      content: content,
    };

    blog.comments.push(newComment);
    await blog.save();

    res.status(201).json(blog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Existing functions to get blogs
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().populate('user').populate('comments.user');
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Existing function to get a single blog
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('user').populate('comments.user');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Existing function to create a blog
exports.createBlog = async (req, res) => {
  const { title, content } = req.body;

  try {
    const newBlog = new Blog({
      title,
      content,
      user: req.user.id,
    });

    const savedBlog = await newBlog.save();
    res.status(201).json(savedBlog);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
