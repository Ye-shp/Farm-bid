const express = require('express');
const { register, login, getUserRole } = require('../controllers/authControllers');
const { forgotPassword, resetPassword } = require('../controllers/passwordController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/user-role', authMiddleware, getUserRole);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
