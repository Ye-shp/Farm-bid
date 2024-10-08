const Blog = require('../models/Blog');

// Create a new blog post
exports.createBlog = async (req, res) => {
  const { title, content } = req.body;
  try {
    const blog = new Blog({
      title,
      content,
      user: req.user.id, // Attach logged-in user
    });
    await blog.save();
    res.status(201).json(blog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all blogs
exports.getBlogs= async (req, res) => {
  try {
    const blogs = await Blog.find().populate('user', 'email role').sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get a single blog post by ID
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('user', 'email role').populate('comments.user', 'email');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add a comment or reply to a blog post
exports.addCommentToBlogPost = async (req, res) => {
  const { blogId } = req.params;
  const { content, parentComment } = req.body;
  const userId = req.user.id; // Assuming you have authMiddleware providing user info

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    const newComment = {
      user: userId,
      content,
      parentComment: parentComment || null, // If parentComment exists, it's a reply
    };

    blog.comments.push(newComment);
    await blog.save();

    res.status(201).json(blog);
  } catch (err) {
    res.status(500).json({ message: 'Error adding comment' });
  }
};
