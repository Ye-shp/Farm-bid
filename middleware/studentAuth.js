const jwt = require('jsonwebtoken');

const studentAuth = (req, res, next) => {
  const token = req.header('x-student-token');
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.STUDENT_JWT_SECRET || 'your-student-secret-key');
    req.student = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = studentAuth;