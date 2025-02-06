const Auction = require('../models/Auctions');
const { Product } = require('../models/Product');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const PaymentService = require('../services/paymentService');
const notificationService = require('./services/notificationService');

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
        
        // Use PaymentService to handle payment intent creation
        const { paymentIntent } = await PaymentService.handleAuctionEnd(auction);
        auction.paymentIntentId = paymentIntent.id;

        // Notify the winner
        await notificationService.createAndSendNotification({
          user: winningBid.user,
          message: `Congratulations! You won the auction for "${auction.product.title}" with a bid of $${winningBid.amount}. Please complete your payment.`,
          type: 'auction_won',
          metadata: {
            auctionId: auction._id,
            paymentIntentClientSecret: paymentIntent.client_secret
          }
        });

        // Notify the farmer
        await notificationService.createAndSendNotification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with a winning bid of $${winningBid.amount}.`,
          type: 'auction_ended',
          metadata: {
            auctionId: auction._id
          }
        });
      } else {
        // Notify the farmer that no bids were placed
        await notificationService.createAndSendNotification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with no bids.`,
          type: 'auction_ended_no_bids'
        });
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
      // .select('_id product startingPrice currentPrice endTime auctionQuantity status')
      .populate({
        path: 'product',
        populate: { path: 'user' }
      })
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
      .populate({
        path: 'product',
        populate: { path: 'user' }
      })
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
    const { productId, startingPrice, endTime, minIncrement, auctionQuantity, delivery} = req.body;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    if (product.totalQuantity < auctionQuantity){
      return res.status(404).json({message: 'Auction quantity is larger that available quantity'});
    }
    product.totalQuantity -= auctionQuantity;
    await product.save();

    const auction = new Auction({
      product: productId,
      startingPrice,
      currentPrice: startingPrice,
      endTime,
      auctionQuantity,
      minIncrement,
      delivery,
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
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Validate auctionId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({ message: 'Invalid auction ID format' });
    }

    const auction = await Auction.findById(auctionId)
      .populate({
        path: 'product',
        populate: { path: 'user' }
      });
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'This auction has ended' });
    }

    const currentHighestBid = auction.bids.length > 0
      ? Math.max(...auction.bids.map((bid) => bid.amount))
      : auction.startingPrice;

    if (bidAmount <= currentHighestBid) {
      return res.status(400).json({ message: 'Bid must be higher than current highest bid' });
    }

    auction.bids.push({
      user: userId,
      amount: bidAmount,
      time: new Date()
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
    res.status(500).json({ message: error.message || 'Error submitting bid' });
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
    const { bidId } = req.body;
    console.log('Accepting bid:', { auctionId, bidId });

    const auction = await Auction.findById(auctionId)
      .populate({
        path: 'product',
        populate: { path: 'user' }
      })
      .populate('bids.user');

    if (!auction) {
      console.log('Auction not found:', auctionId);
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Log auction data for debugging
    console.log('Found auction:', {
      id: auction._id,
      productId: auction.product._id,
      bidsCount: auction.bids.length,
      bids: auction.bids.map(bid => ({
        id: bid._id,
        amount: bid.amount,
        userId: bid.user._id
      }))
    });

    // Verify the user is the owner of the product
    console.log('Checking authorization:', {
      productOwner: auction.product.user._id,
      requestUser: req.user.id
    });

    if (auction.product.user._id.toString() !== req.user.id) {
      console.log('Unauthorized bid acceptance:', {
        productOwner: auction.product.user,
        requestUser: req.user.id
      });
      return res.status(403).json({ message: 'Not authorized to accept bids for this auction' });
    }

    const winningBid = auction.bids.find(bid => bid._id.equals(bidId));
    if (!winningBid) {
      console.log('Bid not found:', { auctionId, bidId });
      return res.status(404).json({ message: 'Bid not found' });
    }

    console.log('Found winning bid:', {
      bidId: winningBid._id,
      userId: winningBid.user._id,
      amount: winningBid.amount
    });

    // Create payment intent for the winning bid
    const { paymentIntent } = await PaymentService.createPaymentIntent({
      amount: winningBid.amount,
      sourceType: 'auction',
      sourceId: auction._id.toString(),
      buyerId: winningBid.user._id.toString(),
      sellerId: auction.product.user._id.toString(),
      metadata: {
        auctionId: auction._id.toString(),
        productId: auction.product._id.toString(),
        bidId: winningBid._id.toString(),
        deliveryMethod: auction.delivery ? 'delivery': 'pickup'
      }
    });

    auction.paymentIntentId = paymentIntent.id;
    auction.status = 'ended';
    auction.winningBid = {
      user: winningBid.user._id,
      amount: winningBid.amount,
      time: new Date()
    };
    auction.acceptedAt = new Date();
    await auction.save();

    // Create buyer notification with payment information
    await notificationService.createAndSendNotification({
      user: winningBid.user,
      message: `Congratulations! Your bid of $${winningBid.amount} was accepted for "${auction.product.title}". Click here to complete your payment.`,
      type: 'auction_won',
      metadata: {
        auctionId: auction._id,
        amount: winningBid.amount,
        title: auction.product.title,
        paymentIntentClientSecret: paymentIntent.client_secret
      },
      io : req.app.get('io')
    });

    // Create seller notification
    await notificationService.createAndSendNotification({
      user: auction.product.user,
      message: `A bid of $${winningBid.amount} has been accepted for your auction "${auction.product.title}".`,
      type: 'auction_ended',
      metadata: {
        auctionId: auction._id,
        amount: winningBid.amount,
        title: auction.product.title
      },
      io : req.app.get('io')
    });

    res.json({ 
      message: 'Bid accepted successfully', 
      auction,
      notifications: {
        buyer: winningBid.user,
        seller: auction.product.user
      }
    });
  } catch (error) {
    console.error('Error accepting bid:', error);
    res.status(500).json({ error: error.message });
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

    // Use PaymentService to handle payment intent creation
    const { paymentIntent } = await PaymentService.handlePaymentIntentCreation(auction, amount);
    auction.paymentIntentId = paymentIntent.id;
    await auction.save();

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
    event = PaymentService.webhooks.constructEvent(
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
        
        await notificationService.createAndSendNotification({
          user: winningBid.user,
          message: `Payment successful for auction "${auction.title}". The seller will be notified to fulfill your order.`,
          type: 'payment_success'
        });

        await notificationService.createAndSendNotification({
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
  getAuctions: exports.getAuctions,
  getFarmerAuctions: exports.getFarmerAuctions,
  getAuctionDetails: exports.getAuctionDetails,
  createAuction: exports.createAuction,
  submitBid: exports.submitBid,
  endAuction: exports.endAuction,
  acceptBid: exports.acceptBid,
  createPaymentIntent: exports.createPaymentIntent,
  handlePaymentWebhook: exports.handlePaymentWebhook
};
