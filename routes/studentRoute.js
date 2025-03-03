const express = require('express');
const router = express.Router();
const Student = require('../models/Students');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const studentAuth = require('../middleware/studentAuth');
const Prospect = require('../models/Prospect');

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

// Get all prospects
router.get('/prospects', studentAuth, async (req, res) => {
  try {
    const prospects = await Prospect.find()
      .populate('assignedStudent', 'studentId')
      .populate('contactHistory.student', 'studentId');
    res.json(prospects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Claim a prospect
router.post('/prospects/:id/claim', studentAuth, async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect not found' });
    }
    
    if (prospect.status !== 'unclaimed') {
      return res.status(400).json({ message: 'Prospect is already claimed' });
    }

    prospect.status = 'in_progress';
    prospect.assignedStudent = req.student._id;
    prospect.assignedDate = new Date();
    await prospect.save();

    res.json(prospect);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Log contact with prospect
router.post('/prospects/:id/contact', studentAuth, async (req, res) => {
  try {
    const prospect = await Prospect.findById(req.params.id);
    if (!prospect) {
      return res.status(404).json({ message: 'Prospect not found' });
    }

    if (prospect.assignedStudent.toString() !== req.student._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    prospect.contactHistory.push({
      student: req.student._id,
      date: new Date(),
      notes: req.body.notes,
      contactMethod: req.body.contactMethod
    });
    prospect.lastContactDate = new Date();
    await prospect.save();

    res.json(prospect);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;