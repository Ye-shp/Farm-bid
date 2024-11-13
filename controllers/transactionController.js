// controllers/transactionController.js
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const stripe = require('../config/stripeconfig');
const User = require('../models/User');
const Auction = require('../models/Auctions');
const OpenContract = require('../models/OpenContract');
const asyncHandler = require('express-async-handler');

const transactionController = {
  // Create transaction from won auction
  createAuctionTransaction: asyncHandler(async (req, res) => {
    const { auctionId } = req.body;
    const auction = await Auction.findById(auctionId)
      .populate('product')
      .populate('winningBid.user');

    if (!auction || auction.status !== 'ended') {
      return res.status(400).json({ message: 'Invalid auction or auction not ended' });
    }

    const seller = await User.findById(auction.product.user);
    if (!seller.stripeAccountId) {
      return res.status(400).json({ message: 'Seller not setup for payments' });
    }

    // Create payment intent with automatic transfer to seller
    const paymentIntent = await stripe.paymentIntents.create({
      amount: auction.winningBid.amount * 100,
      currency: 'usd',
      capture_method: 'manual', // Enable payment hold
      transfer_data: {
        destination: seller.stripeAccountId,
      },
      metadata: {
        auctionId: auction._id.toString(),
        type: 'auction'
      }
    });

    const transaction = new Transaction({
      sourceType: 'auction',
      sourceId: auctionId,
      buyer: auction.winningBid.user._id,
      seller: seller._id,
      amount: auction.winningBid.amount,
      paymentIntent: {
        stripeId: paymentIntent.id,
        status: paymentIntent.status
      },
      status: 'pending'
    });

    await transaction.save();
    
    // Update auction with payment intent
    auction.paymentIntentId = paymentIntent.id;
    await auction.save();

    // Create notifications
    await Promise.all([
      new Notification({
        user: auction.winningBid.user._id,
        type: 'payment',
        message: `Payment hold created for auction ${auction._id}`
      }).save(),
      new Notification({
        user: seller._id,
        type: 'payment',
        message: `New sale pending for auction ${auction._id}`
      }).save()
    ]);

    res.status(201).json({
      transaction,
      clientSecret: paymentIntent.client_secret
    });
  }),

  // Create transaction from fulfilled contract
  createContractTransaction: asyncHandler(async (req, res) => {
    const { contractId, fulfillmentId } = req.body;
    const contract = await OpenContract.findById(contractId);
    
    if (!contract || contract.status !== 'fulfilled') {
      return res.status(400).json({ message: 'Invalid contract or not fulfilled' });
    }

    const fulfillment = contract.fulfillments.id(fulfillmentId);
    if (!fulfillment) {
      return res.status(400).json({ message: 'Fulfillment not found' });
    }

    const seller = await User.findById(fulfillment.farmer);
    if (!seller.stripeAccountId) {
      return res.status(400).json({ message: 'Seller not setup for payments' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: fulfillment.price * fulfillment.quantity * 100,
      currency: 'usd',
      capture_method: 'manual',
      transfer_data: {
        destination: seller.stripeAccountId,
      },
      metadata: {
        contractId: contract._id.toString(),
        type: 'contract'
      }
    });

    const transaction = new Transaction({
      sourceType: 'contract',
      sourceId: contractId,
      buyer: contract.buyer,
      seller: fulfillment.farmer,
      amount: fulfillment.price * fulfillment.quantity,
      paymentIntent: {
        stripeId: paymentIntent.id,
        status: paymentIntent.status
      },
      status: 'pending'
    });

    await transaction.save();

    await Promise.all([
      new Notification({
        user: contract.buyer,
        type: 'payment',
        message: `Payment hold created for contract ${contract._id}`
      }).save(),
      new Notification({
        user: fulfillment.farmer,
        type: 'payment',
        message: `New sale pending for contract ${contract._id}`
      }).save()
    ]);

    res.status(201).json({
      transaction,
      clientSecret: paymentIntent.client_secret
    });
  }),

  // Confirm delivery and process payment
  confirmDelivery: asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Verify buyer is confirming
    if (req.user.id !== transaction.buyer.toString()) {
      return res.status(403).json({ message: 'Only buyer can confirm delivery' });
    }

    try {
      // Capture the held payment
      const paymentIntent = await stripe.paymentIntents.capture(
        transaction.paymentIntent.stripeId
      );

      transaction.status = 'completed';
      transaction.delivery.status = 'completed';
      transaction.delivery.completedTime = new Date();
      transaction.paymentIntent.status = paymentIntent.status;
      await transaction.save();

      // Create payout record
      const payout = new Payout({
        userId: transaction.seller,
        amount: transaction.amount,
        date: new Date(),
        stripePayoutId: paymentIntent.transfer // Stripe creates automatic transfer
      });
      await payout.save();

      // Update source document status
      if (transaction.sourceType === 'auction') {
        await Auction.findByIdAndUpdate(transaction.sourceId, { status: 'paid' });
      } else {
        await OpenContract.findByIdAndUpdate(transaction.sourceId, { status: 'paid' });
      }

      await new Notification({
        user: transaction.seller,
        type: 'payment',
        message: 'Payment processed for completed delivery'
      }).save();

      res.json({ transaction, payout });
    } catch (error) {
      console.error('Payment capture error:', error);
      res.status(500).json({ message: 'Failed to process payment' });
    }
  }),

  // Update delivery details
  updateDelivery: asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    const { method, address, scheduledTime } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Verify user is part of transaction
    if (![transaction.buyer.toString(), transaction.seller.toString()]
        .includes(req.user.id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    transaction.delivery = {
      method,
      status: 'pending',
      address,
      scheduledTime: new Date(scheduledTime)
    };

    await transaction.save();

    // Notify other party
    const recipientId = req.user.id === transaction.buyer.toString() 
      ? transaction.seller 
      : transaction.buyer;

    await new Notification({
      user: recipientId,
      type: 'delivery',
      message: `Delivery details updated for transaction ${transactionId}`
    }).save();

    res.json(transaction);
  }),

  // Get transaction details
  getTransaction: asyncHandler(async (req, res) => {
    const { transactionId } = req.params;
    
    const transaction = await Transaction.findById(transactionId)
      .populate('buyer', 'username email')
      .populate('seller', 'username email');

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (![transaction.buyer._id.toString(), transaction.seller._id.toString()]
        .includes(req.user.id)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(transaction);
  }),

  // List user's transactions
  listTransactions: asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const query = {
      $or: [
        { buyer: req.user.id },
        { seller: req.user.id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate('buyer', 'username email')
        .populate('seller', 'username email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(query)
    ]);

    res.json({
      transactions,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  })
};

module.exports = transactionController;
