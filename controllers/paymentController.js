const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const Order = require('../models/Order');
const Auction = require('../models/Auctions');
const Notification = require('../models/Notification');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Create a payment intent
exports.createPaymentIntent = async (req, res) => {
  try {
    const { contractId } = req.body;

    const contract = await OpenContract.findById(contractId)
      .populate('buyer')
      .populate('fulfillments.farmer');

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const amount = contract.calculateTotalAmount();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        contractId,
        buyerId: contract.buyer._id.toString(),
        farmerId: contract.fulfillments[0].farmer._id.toString()
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: amount
    });
  } catch (err) {
    console.error('Error creating payment intent:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while creating payment intent'
    });
  }
};

// Process payment for a contract (buyer)
exports.processPayment = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { paymentIntentId } = req.body;

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

    try {
      // Retrieve the payment intent
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment has not been completed');
      }

      // Update contract with payment details
      contract.paymentDetails = {
        transactionId: paymentIntent.id,
        amount: paymentIntent.amount / 100, // Convert from cents
        processingFee: (paymentIntent.amount / 100) * 0.05, // 5% processing fee
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

// Handle auction payment success
async function handleAuctionPayment(paymentIntent) {
  try {
    const { auctionId } = paymentIntent.metadata;
    
    const auction = await Auction.findById(auctionId)
      .populate('product')
      .populate('winningBid.user');
      
    if (!auction) {
      throw new Error('Auction not found');
    }

    // Create or update order
    const order = await Order.findOneAndUpdate(
      { paymentIntentId: paymentIntent.id },
      {
        auction: auctionId,
        buyer: auction.winningBid.user._id,
        seller: auction.product.user,
        amount: paymentIntent.amount / 100,
        status: 'paid',
        paymentDate: new Date()
      },
      { upsert: true, new: true }
    );

    // Update auction payment status
    auction.paymentStatus = 'paid';
    await auction.save();

    // Notify buyer and seller
    await Notification.create([
      {
        user: order.buyer,
        message: `Your payment of $${order.amount} for auction "${auction.product.title}" has been received.`,
        type: 'payment',
        metadata: { orderId: order._id }
      },
      {
        user: order.seller,
        message: `Payment of $${order.amount} has been received for your auction "${auction.product.title}".`,
        type: 'payment',
        metadata: { orderId: order._id }
      }
    ]);

    return order;
  } catch (error) {
    console.error('Error handling auction payment:', error);
    throw error;
  }
}

// Handle Stripe webhook
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        
        // Check if this is an auction payment
        if (paymentIntent.metadata.auctionId) {
          await handleAuctionPayment(paymentIntent);
        } else {
          // Handle other payment types (e.g., contracts)
          await handleSuccessfulPayment(paymentIntent);
        }
        break;
        
      case 'transfer.paid':
        await handleSuccessfulPayout(event.data.object);
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error processing webhook:', err);
    res.status(500).json({ error: err.message });
  }
};

// Get payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    res.json(paymentIntent);
  } catch (err) {
    console.error('Error retrieving payment details:', err);
    res.status(500).json({
      error: err.message || 'An error occurred while retrieving payment details'
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

// Helper function to handle successful payment
async function handleSuccessfulPayment(paymentIntent) {
  const { contractId } = paymentIntent.metadata;
  
  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    contract.paymentStatus = 'completed';
    contract.paymentDetails = {
      transactionId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      processingFee: (paymentIntent.amount / 100) * 0.05,
      paymentDate: new Date(),
      paymentMethod: 'stripe'
    };

    await contract.save();
  } catch (err) {
    console.error('Error handling successful payment:', err);
    throw err;
  }
}

// Helper function to handle successful payout
async function handleSuccessfulPayout(transfer) {
  const { contractId } = transfer.metadata;
  
  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      throw new Error('Contract not found');
    }

    contract.status = 'completed';
    await contract.save();
  } catch (err) {
    console.error('Error handling successful payout:', err);
    throw err;
  }
}
