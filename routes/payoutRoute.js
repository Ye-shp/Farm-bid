const express = require('express');
const router = express.Router();
const { getUserBalance, requestPayout } = require('../controllers/payoutController');

router.get('/seller-balance', async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await getUserBalance(userId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/request-payout', async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;
    const data = await requestPayout(userId, amount);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
