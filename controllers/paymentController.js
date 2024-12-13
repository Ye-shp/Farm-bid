const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Process payment for a contract (buyer)
exports.processPayment = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { paymentMethodId } = req.body;

    const contract = await OpenContract.findById(contractId)
      .populate('buyer')
      .populate('fulfillments.farmer');

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.buyer._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to process payment for this contract' });
    }

    if (contract.paymentStatus === 'completed') {
      return res.status(400).json({ error: 'Payment has already been processed' });
    }

    const amount = contract.calculateTotalAmount();
    
    try {
      // Update contract payment status
      contract.paymentStatus = 'processing';
      await contract.save();

      // Create payment intent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        payment_method: paymentMethodId,
        confirm: true,
        description: `Payment for contract ${contractId}`,
        metadata: {
          contractId,
          buyerId: contract.buyer._id.toString(),
          farmerId: contract.fulfillments[0].farmer._id.toString()
        }
      });

      // Update contract with payment details
      contract.paymentDetails = {
        transactionId: paymentIntent.id,
        amount: amount,
        processingFee: amount * 0.05, // 5% processing fee
        paymentDate: new Date(),
        paymentMethod: 'stripe'
      };
      contract.paymentStatus = 'completed';
      await contract.save();

      res.json({
        success: true,
        paymentIntent,
        contract
      });
    } catch (stripeError) {
      // Handle failed payment
      contract.paymentStatus = 'failed';
      await contract.save();
      
      throw stripeError;
    }
  } catch (err) {
    console.error('Payment processing error:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while processing the payment'
    });
  }
};

// Process payout to farmer
exports.processPayout = async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await OpenContract.findById(contractId)
      .populate('fulfillments.farmer');

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const farmer = contract.fulfillments[0].farmer;
    if (!farmer.stripeAccountId) {
      return res.status(400).json({ error: 'Farmer has not set up payout information' });
    }

    if (contract.paymentStatus !== 'completed') {
      return res.status(400).json({ error: 'Cannot process payout before payment is completed' });
    }

    const amount = contract.calculateTotalAmount();
    const platformFee = amount * 0.05; // 5% platform fee
    const payoutAmount = amount - platformFee;

    try {
      // Create transfer to farmer's connected account
      const transfer = await stripe.transfers.create({
        amount: Math.round(payoutAmount * 100), // Convert to cents
        currency: 'usd',
        destination: farmer.stripeAccountId,
        description: `Payout for contract ${contractId}`,
        metadata: {
          contractId,
          farmerId: farmer._id.toString()
        }
      });

      // Update contract status
      contract.status = 'completed';
      await contract.save();

      res.json({
        success: true,
        transfer,
        contract
      });
    } catch (stripeError) {
      throw stripeError;
    }
  } catch (err) {
    console.error('Payout processing error:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while processing the payout'
    });
  }
};

// Get payment status
exports.getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
    
    res.json(paymentIntent);
  } catch (err) {
    console.error('Error retrieving payment status:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while retrieving payment status'
    });
  }
};

// Get payout status
exports.getPayoutStatus = async (req, res) => {
  try {
    const { payoutId } = req.params;
    const transfer = await stripe.transfers.retrieve(payoutId);
    
    res.json(transfer);
  } catch (err) {
    console.error('Error retrieving payout status:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while retrieving payout status'
    });
  }
};
