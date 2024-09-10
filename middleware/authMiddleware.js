const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  console.log('Authorization Header:', authHeader); // Log header for debugging

  if (!authHeader) return res.status(401).json({ message: 'No authorization header provided' });

  const token = authHeader.replace('Bearer ', '');
  console.log('Token after replacement:', token); // Log token for debugging

  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach the decoded token to req.user
    next();
  } catch (err) {
    console.error('Token verification error:', err); // Log error details
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = authMiddleware;