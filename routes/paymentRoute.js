const express = require("express");
const router = express.Router();
const PaymentService = require("../services/paymentService");
const Transaction = require("../models/Transaction");
const { authMiddleware } = require("../middleware/authMiddleware");
const { 
    addBankAccount, 
    requestPayout,
    getSellerBalance,
    getSellerTransfers,
    createConnectedAccount,
    createPayoutForAuction 
} = require('../controllers/payController');

// Register the connected account route first
router.post('/create-connected-account', authMiddleware, createConnectedAccount);

// Create payment intent
router.post("/create-intent", authMiddleware, async (req, res) => {
  try {
    const { amount, sourceType, sourceId, sellerId } = req.body;

    const paymentData = await PaymentService.createPaymentIntent({
      amount,
      sourceType,
      sourceId,
      buyerId: req.user._id,
      sellerId,
      metadata: {
        buyerEmail: req.user.email,
        deliveryMethod: "delivery",
      },
    });

    // Return complete payment intent data
    res.json({
      client_secret: paymentData.client_secret,
      status: paymentData.status,
      id: paymentData.id,
      transactionId: paymentData.transaction?._id,
      amount: amount,
      fees: paymentData.fees,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: error.message });
  }
});

// Process payout
router.post(
  "/process-payout/:transactionId",
  authMiddleware,
  async (req, res) => {
    try {
      const { transactionId } = req.params;

      const { transfer, payout } = await PaymentService.processPayout(
        transactionId
      );

      res.json({
        success: true,
        payoutId: payout._id,
        amount: payout.amount,
        status: transfer.status,
      });
    } catch (error) {
      console.error("Error processing payout:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Handle Stripe webhook
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];
      const event = PaymentService.verifyWebhookSignature(req.body, sig);

      await PaymentService.handleWebhookEvent(event);

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Get transaction status
router.get("/transaction/:transactionId", authMiddleware, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.transactionId)
      .populate("buyer", "name email")
      .populate("seller", "name email");

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Check if user is buyer or seller
    if (
      transaction.buyer._id.toString() !== req.user._id.toString() &&
      transaction.seller._id.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this transaction" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Error getting transaction:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/add-bank-account', authMiddleware, addBankAccount);
router.get('/balance', authMiddleware, getSellerBalance);
router.get('/transfers', authMiddleware, getSellerTransfers);
router.post('/request-payout', authMiddleware, requestPayout);
router.post('/create-payout-for-auction', authMiddleware, createPayoutForAuction);

module.exports = router;
