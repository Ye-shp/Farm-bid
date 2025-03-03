const express = require('express');
const router = express.Router();
const Student = require('../models/Students');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const studentAuth = require('../middleware/studentAuth');

// Student Registration
router.post('/register', async (req, res) => {
  try {
    const { studentId, password, school } = req.body;
    
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) {
      return res.status(400).json({ message: 'Student ID already exists' });
    }

    const student = new Student({ studentId, password, school });
    await student.save();
    
    res.status(201).json({ message: 'Student registered successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Student Login
router.post('/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;
    const student = await Student.findOne({ studentId });
    
    if (!student) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: student._id, role: 'student' },
      process.env.STUDENT_JWT_SECRET || 'your-student-secret-key',
      { expiresIn: '1d' }
    );

    res.json({ token, studentId: student.studentId });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Protected route example
router.get('/customers', studentAuth, async (req, res) => {
  try {
    // Example customer data - replace with your actual data fetch
    const customers = [
      { _id: 1, name: 'Farm A', location: 'Location A' },
      { _id: 2, name: 'Farm B', location: 'Location B' },
    ];
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;