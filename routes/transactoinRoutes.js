// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const transactionController = require('../controllers/transactionController');

router.post('/auction', 
  authMiddleware, 
  transactionController.createAuctionTransaction
);

router.post('/contract', 
  authMiddleware, 
  transactionController.createContractTransaction
);

router.post('/:transactionId/confirm', 
  authMiddleware, 
  transactionController.confirmDelivery
);

router.put('/:transactionId/delivery', 
  authMiddleware, 
  transactionController.updateDelivery
);

router.get('/:transactionId', 
  authMiddleware, 
  transactionController.getTransaction
);

router.get('/', 
  authMiddleware, 
  transactionController.listTransactions
);

module.exports = router;