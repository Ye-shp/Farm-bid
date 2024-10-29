const Blog = require('../models/Blog');
const User = require('../models/User');
const FeaturedFarms = require('../models/FeaturedFarms'); // Import FeaturedFarms model

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
exports.getBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().populate('user', 'username role').sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get a single blog post by ID (and increment views)
exports.getBlogById = async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate('user', 'username role').populate('comments.user', 'username');
    if (!blog) return res.status(404).json({ message: 'Blog not found' });

    // Increment the view count
    blog.views += 1;
    await blog.save();

    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Like or unlike a blog post
exports.likeBlogPost = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if the user already liked the blog
    const liked = blog.likes.some(like=>like.toString()===userId);

    if (liked) {
      // If already liked, remove the like (unlike)
      blog.likes = blog.likes.filter(like => like.toString() !== userId);
    } else {
      // If not liked, add the like
      blog.likes.push(userId);
    }

    await blog.save();

    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: 'Error liking the blog' });
  }
};

// Add a comment or reply to a blog post
exports.addCommentToBlogPost = async (req, res) => {
  const { id } = req.params;
  const { content, parentComment } = req.body;
  const userId = req.user.id; // Assuming you have authMiddleware providing user info

  try {
    const blog = await Blog.findById(id);
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

// Get Featured Farms of the Week
exports.getFeaturedFarms = async (req, res) => {
  try {
    // Fetch the featured farms from the FeaturedFarms collection
    const featuredFarms = await FeaturedFarms.findOne().populate('farms._id', 'username description location');
    
    if (!featuredFarms || !featuredFarms.farms.length) {
      return res.status(404).json({ message: 'No featured farms found' });
    }

    res.status(200).json(featuredFarms.farms);
  } catch (error) {
    console.error('Error fetching featured farms:', error);
    res.status(500).json({ message: 'Error fetching featured farms', details: error.message });
  }
};

