const User = require('../models/User'); // Correctly reference the User model
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registration Controller
exports.register = async (req, res) => {
  const { username, email, password, role, location } = req.body;

  // Ensure that username is provided
  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }

  try {
    // Check if the user already exists in the database
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('User already exists with email:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password before saving it to the database
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the new user document
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      phone, 
      location: {
        latitude: location?.latitude || null,
        longitude: location?.longitude || null
      }
    });

    // Save the new user in the database
    await newUser.save();
    console.log('User successfully saved:', newUser);

    // Generate a JWT token for the user
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role, username: newUser.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Respond with the user's details and success message
    return res.status(201).json({
      message: 'User registered successfully',
      user: { name: username, id: newUser._id, email: newUser.email, role: newUser.role },
      token
    });

  } catch (error) {
    console.error('Error during registration:', error.message);
    console.error('Error stack trace:', error.stack);
    return res.status(500).json({ message: 'Internal server error. Please try again later.' });
  }
};

// Login Controller
exports.login = async (req, res) => {
  const { email, password, location } = req.body; // Added location to login request body

  try {
    // Check if the user exists in the database
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Update user's location if provided during login
    if (location && location.latitude && location.longitude) {
      user.location = {
        latitude: location.latitude,
        longitude: location.longitude
      };
      await user.save();  // Save the updated location
    }

    // Generate a JWT token for authentication
    const token = jwt.sign({ id: user._id, role: user.role, username: user.Username }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Respond with the token, user role, and email
    return res.json({ 
      token, 
      user: { id: user._id, email: user.email, role: user.role } 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Get User Role Controller
exports.getUserRole = async (req, res) => {
  try {
    // Fetch the user by their ID
    const user = await User.findById(req.user.id);
    return res.json({ role: user.role, email: user.email });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
