const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registration Controller
exports.register = async (req, res) => {
  const { email, password, role, location } = req.body;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create a new user with location
    const newUser = new User({ 
      email, 
      password: hashedPassword, 
      role, 
      location: {
        latitude: location.latitude,
        longitude: location.longitude
      }
    });

    // Save the new user
    await newUser.save();

    // Return the new user
    return res.status(201).json({ 
      message: 'User registered successfully', 
      user: { id: newUser._id, email: newUser.email, role: newUser.role } 
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error saving new user', error });
  }
};
