// Import required modules
const User = require('../models/User'); // Correctly reference the User model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registration Controller
exports.register = async (req, res) => {
  const { email, password, role } = req.body;

  try {
    // Check if the user already exists in the database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password before saving it to the database
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, role });

    // Save the new user in the database
    await newUser.save();

    // Respond with a success message
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    // Handle any errors during registration
    res.status(500).json({ error: err.message });
  }
};

// Login Controller
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if the user exists in the database
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Generate a JWT token for authentication
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Respond with the token and user role
    res.json({ token, role: user.role });
  } catch (err) {
    // Handle any errors during login
    res.status(500).json({ error: err.message });
  }
};

// Get User Role Controller
exports.getUserRole = async (req, res) => {
  try {
    // Fetch the user by their ID
    const user = await User.findById(req.user.id);
    res.json({ role: user.role });
  } catch (err) {
    // Handle any errors in fetching user role
    res.status(500).json({ error: err.message });
  }
};
