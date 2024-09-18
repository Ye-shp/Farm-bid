const express = require('express');
const { register, login, getUserRole } = require('../controllers/authControllers');
const { authMiddleware } = require('../middleware/authMiddleware');  // Destructured import

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/user-role', authMiddleware, getUserRole);  // Apply the middleware here

module.exports = router;
