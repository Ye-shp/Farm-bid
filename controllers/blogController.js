const Blog = require('../models/Blog');
const User = require('../models/User');

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
  const { blogId } = req.params;

  try {
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    // Check if the user already liked the blog
    const liked = blog.likes.includes(userId);

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
  const { blogId } = req.params;
  const { content, parentComment } = req.body;
  const userId = req.user.username; // Assuming you have authMiddleware providing user info

  try {
    const blog = await Blog.findById(blogId);
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

// Get Featured Farms of the Week based on blog engagement
exports.getFeaturedFarms = async (req, res) => {
  try {
    // Aggregate blog engagement data (views, likes, comments) by user (farmer)
    const topEngagedUsers = await Blog.aggregate([
      {
        $group: {
          _id: "$user",  // Group by the user (farmer)
          totalEngagement: { $sum: { $add: ["$views", { $size: "$likes" }, { $size: "$comments" }] } }
        }
      },
      { $sort: { totalEngagement: -1 } },  // Sort by highest engagement
      { $limit: 3 }  // Get top 3 users (farmers)
    ]);

    // Populate user details
    const featuredFarms = await User.find({
      _id: { $in: topEngagedUsers.map(farm => farm._id) }
    }).select('name email');  // Select only the relevant fields (e.g., name, email)

    res.status(200).json(featuredFarms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching featured farms' });
  }
};