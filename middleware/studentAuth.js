const jwt = require('jsonwebtoken');
const Student = require('../models/Students');

const studentAuth = async (req, res, next) => {
  try {
    const token = req.header('x-student-token');
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.STUDENT_JWT_SECRET || 'your-student-secret-key');
    const student = await Student.findById(decoded.id);
    
    if (!student) {
      return res.status(401).json({ message: 'Student not found' });
    }

    // Attach the student object to the request
    req.student = student;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = studentAuth;