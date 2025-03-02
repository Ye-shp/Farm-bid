const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const jwt = require('jsonwebtoken');

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
    
    if (!student || !(await student.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: student._id, role: 'student' },
      process.env.STUDENT_JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, studentId: student.studentId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;