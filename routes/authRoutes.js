const express = require('express');
const { register, login, getUserRole } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/user-role', authMiddleware, getUserRole);

module.exports = router;
