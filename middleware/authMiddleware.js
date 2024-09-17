const jwt = require('jsonwebtoken');  // Ensure jwt is imported

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  console.log('Authorization Header:', authHeader); // Log header for debugging

  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization header provided' });
  }

  // Extract the token more safely
  const token = authHeader.split(' ')[1];  // Extract token after 'Bearer'
  
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token.trim(), process.env.JWT_SECRET); // Verify and trim token
    req.user = decoded; // Attach the decoded token to req.user
    console.log('Decoded User:', decoded); // Log decoded user for debugging
    next();  // Proceed to the next middleware or route
  } catch (err) {
    console.error('Token verification error:', err); // Log error details
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
