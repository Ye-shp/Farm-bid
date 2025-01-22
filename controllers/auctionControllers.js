const Auction = require('../models/Auctions');
const { Product } = require('../models/Product');  // Destructure Product from the exports
const mongoose = require('mongoose');  
const Notification = require('../models/Notification');
const stripe = require('../config/stripeconfig');

//Error in checkAndUpdateExpiredAuctions: TypeError: Cannot read properties of null (reading '_id')
const checkAndUpdateExpiredAuctions = async () => {
  const currentTime = new Date();
  
  try {
    // Find all active auctions that have passed their end time
    const expiredAuctions = await Auction.find({
      status: 'active',
      endTime: { $lt: currentTime }
    }).populate('product');

    for (const auction of expiredAuctions) {
      // If there are bids, set the winner
      if (auction.bids.length > 0) {
        const winningBid = auction.bids[auction.bids.length - 1];
        auction.winningBid = winningBid;
        
        // Create a payment intent for the winning amount
        const paymentIntent = await stripe.paymentIntents.create({
          amount: winningBid.amount * 100,
          currency: 'usd',
          automatic_payment_methods: { enabled: true },
          metadata: {
            auctionId: auction._id.toString(),
            productId: auction.product._id.toString()
          }
        });
        
        auction.paymentIntentId = paymentIntent.id;

        // Notify the winner
        const winnerNotification = new Notification({
          user: winningBid.user,
          message: `Congratulations! You won the auction for "${auction.product.title}" with a bid of $${winningBid.amount}. Please complete your payment.`,
          type: 'auction_won',
          metadata: {
            auctionId: auction._id,
            paymentIntentClientSecret: paymentIntent.client_secret
          }
        });
        await winnerNotification.save();

        // Notify the farmer
        const farmerNotification = new Notification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with a winning bid of $${winningBid.amount}.`,
          type: 'auction_ended',
          metadata: {
            auctionId: auction._id
          }
        });
        await farmerNotification.save();
      } else {
        // Notify the farmer that no bids were placed
        const farmerNotification = new Notification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with no bids.`,
          type: 'auction_ended_no_bids'
        });
        await farmerNotification.save();
      }

      auction.status = 'ended';
      await auction.save();
    }
  } catch (error) {
    console.error('Error in checkAndUpdateExpiredAuctions:', error);
  }
};

// Modified getAuctions to exclude ended auctions by default
exports.getAuctions = async (req, res) => {
  try {
    // First, check for any expired auctions
    await checkAndUpdateExpiredAuctions();

    // Only fetch active auctions by default
    const showEnded = req.query.showEnded === 'true';
    const query = showEnded ? {} : { status: 'active' };
    
    const auctions = await Auction.find(query).populate('product');
    
    const updatedAuctions = auctions.map((auction) => {
      const highestBid = auction.bids.length > 0
        ? Math.max(...auction.bids.map((bid) => bid.amount))
        : auction.startingPrice;

      return {
        ...auction.toObject(),
        highestBid,
        status: auction.status
      };
    });

    res.json(updatedAuctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Modified getFarmerAuctions to include auction status filter
exports.getFarmerAuctions = async (req, res) => {
  try {
    const farmerId = req.user._id;
    const { status } = req.query;

    // Build query based on status filter
    const query = { 'product.user': farmerId };
    if (status) {
      query.status = status;
    }

    const auctions = await Auction.find(query)
      .populate('product')
      .sort({ createdAt: -1 });

    res.json(auctions);
  } catch (error) {
    console.error('Error in getFarmerAuctions:', error);
    res.status(500).json({ message: 'Error fetching farmer auctions' });
  }
};

// Get auction details including winner info
exports.getAuctionDetails = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.auctionId)
      .populate('product')
      .populate('bids.user', 'name email');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    res.json(auction);
  } catch (error) {
    console.error('Error in getAuctionDetails:', error);
    res.status(500).json({ message: 'Error fetching auction details' });
  }
};

// Create a new auction
exports.createAuction = async (req, res) => {
  try {
    const { productId, startingPrice, endTime, minIncrement } = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const auction = new Auction({
      product: productId,
      startingPrice,
      currentPrice: startingPrice,
      endTime,
      minIncrement,
      status: 'active'
    });

    await auction.save();
    res.status(201).json(auction);
  } catch (error) {
    console.error('Error in createAuction:', error);
    res.status(500).json({ message: 'Error creating auction' });
  }
};

// Submit a bid
exports.submitBid = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { bidAmount } = req.body;
    const userId = req.user._id;

    const auction = await Auction.findById(auctionId).populate('product');
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'This auction has ended' });
    }

    const currentHighestBid = auction.bids.length > 0
      ? Math.max(...auction.bids.map(bid => bid.amount))
      : auction.startingPrice;

    if (bidAmount <= currentHighestBid) {
      return res.status(400).json({ message: 'Bid must be higher than current highest bid' });
    }

    auction.bids.push({
      user: userId,
      amount: bidAmount,
      timestamp: new Date()
    });

    auction.currentPrice = bidAmount;
    await auction.save();

    // Create notification for previous highest bidder
    if (auction.bids.length > 1) {
      const previousBidder = auction.bids[auction.bids.length - 2].user;
      await Notification.create({
        user: previousBidder,
        message: `Your bid on "${auction.product.title}" has been outbid. New highest bid: $${bidAmount}`,
        type: 'bid',
        metadata: { auctionId: auction._id }
      });
    }

    res.json(auction);
  } catch (error) {
    console.error('Error in submitBid:', error);
    res.status(500).json({ message: 'Error submitting bid' });
  }
};

// Get notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    console.error('Error in getNotifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
};

// End auction
exports.endAuction = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.auctionId);
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    auction.status = 'ended';
    await auction.save();

    res.json({ message: 'Auction ended successfully' });
  } catch (error) {
    console.error('Error in endAuction:', error);
    res.status(500).json({ message: 'Error ending auction' });
  }
};

// Accept a bid
exports.acceptBid = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const auction = await Auction.findById(auctionId).populate('product');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'This auction has already ended' });
    }

    if (auction.bids.length === 0) {
      return res.status(400).json({ message: 'No bids to accept' });
    }

    const winningBid = auction.bids[auction.bids.length - 1];
    auction.status = 'ended';
    auction.winningBid = winningBid;
    await auction.save();

    // Create notifications
    await Notification.create({
      user: winningBid.user,
      message: `Congratulations! Your bid was accepted for "${auction.product.title}". Please complete your payment.`,
      type: 'auction_won',
      metadata: {
        auctionId: auction._id,
        amount: winningBid.amount,
        title: auction.product.title
      }
    });

    res.json({ message: 'Bid accepted successfully', auction });
  } catch (error) {
    console.error('Error in acceptBid:', error);
    res.status(500).json({ message: 'Error accepting bid' });
  }
};

// Create payment intent for auction
exports.createPaymentIntent = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { amount } = req.body;

    const auction = await Auction.findById(auctionId);
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Verify that the requesting user is the winner
    const winningBid = auction.bids[auction.bids.length - 1];
    if (winningBid.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the auction winner can make payment' });
    }

    // Create or retrieve payment intent
    let paymentIntent;
    if (auction.paymentIntentId) {
      paymentIntent = await stripe.paymentIntents.retrieve(auction.paymentIntentId);
    } else {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          auctionId: auction._id.toString(),
          productId: auction.product.toString()
        }
      });
      
      auction.paymentIntentId = paymentIntent.id;
      await auction.save();
    }

    res.json({
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ message: 'Error creating payment intent' });
  }
};

// Handle successful payment webhook
exports.handlePaymentWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const { auctionId } = paymentIntent.metadata;

    try {
      const auction = await Auction.findById(auctionId);
      if (auction) {
        auction.status = 'paid';
        await auction.save();

        // Create notifications for both buyer and seller
        const winningBid = auction.bids[auction.bids.length - 1];
        
        await Notification.create({
          user: winningBid.user,
          message: `Payment successful for auction "${auction.title}". The seller will be notified to fulfill your order.`,
          type: 'payment_success'
        });

        await Notification.create({
          user: auction.product.user,
          message: `Payment received for auction "${auction.title}". Please proceed with order fulfillment.`,
          type: 'payment_received'
        });
      }
    } catch (error) {
      console.error('Error processing successful payment:', error);
    }
  }

  res.json({ received: true });
};

module.exports = {
  checkAndUpdateExpiredAuctions,
  getAuctions,
  getFarmerAuctions,
  getAuctionDetails,
  createAuction,
  submitBid,
  getNotifications,
  endAuction,
  acceptBid,
  createPaymentIntent,
  handlePaymentWebhook
};
