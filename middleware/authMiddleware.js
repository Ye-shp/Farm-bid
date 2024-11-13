const jwt = require('jsonwebtoken');  // Ensure jwt is imported

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  console.log('Authorization Header:', authHeader); 
  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization header provided' });
  }

  const token = authHeader.split(' ')[1];  
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET); 
    req.user = decoded;     
    next();  
  } catch (err) {
    console.error('Token verification error:', err); 
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Role-based access control
const roleMiddleware = (role) => (req, res, next) => {
  if (req.user && req.user.role === role) {
    next();
  } else {
    return res.status(403).json({ message: 'Access denied. Role not authorized' });
  }
};

module.exports = { authMiddleware, roleMiddleware };
