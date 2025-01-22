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
    // Check for expired auctions first
    await checkAndUpdateExpiredAuctions();

    console.log('Farmer ID:', req.user.id); // Debug user ID

    // Find auctions where the product's user matches the requesting farmer
    const auctions = await Auction.find({})
      .populate({
        path: 'product',
        match: { user: req.user.id }
      });

    console.log('Found auctions before filter:', auctions); // Debug all auctions

    // Filter out auctions where product is null (due to populate match)
    const farmerAuctions = auctions
      .filter(auction => auction.product !== null)
      .map(auction => {
        const highestBid = auction.bids.length > 0
          ? Math.max(...auction.bids.map(bid => bid.amount))
          : auction.startingPrice;

        return {
          ...auction.toObject(),
          highestBid,
          status: auction.status
        };
      });

    console.log('Filtered farmer auctions:', farmerAuctions); // Debug filtered auctions
    res.json(farmerAuctions);
  } catch (err) {
    console.error('Error in getFarmerAuctions:', err); // Debug any errors
    res.status(500).json({ error: err.message });
  }
};

// Get auction details including winner info
exports.getAuctionDetails = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const auction = await Auction.findById(auctionId)
      .populate('product')
      .populate('winningBid.user', 'name email'); // Populate winner details

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Only allow the farmer or winner to see full details
    if (auction.status === 'ended' && 
        req.user.id !== auction.product.user.toString() && 
        (!auction.winningBid || req.user.id !== auction.winningBid.user.toString())) {
      return res.status(403).json({ message: 'Unauthorized to view auction details' });
    }

    res.json(auction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new auction (existing function)
exports.createAuction = async (req, res) => {
  const { productId, startingPrice, endTime } = req.body;  // Changed from startingBid to startingPrice

  try {
    console.log('Creating auction with:', { productId, startingPrice, endTime });
    console.log('User ID:', req.user.id);

    const product = await Product.findById(productId);
    console.log('Found product:', product);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized - you do not own this product' });
    }

    // FIgure this out later when we start approving products manually
    // if (product.status !== 'Approved') {
    //   return res.status(400).json({ message: 'Product must be approved before creating an auction' });
    // }

    const newAuction = new Auction({
      product: productId,
      startingPrice,  // Using startingPrice directly
      endTime: new Date(endTime),  // Ensure endTime is a Date object
      status: 'active',
      bids: [],
    });

    await newAuction.save();
    console.log('Auction created successfully:', newAuction);
    res.status(201).json(newAuction);
  } catch (err) {
    console.error('Error in createAuction:', err);
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid product ID format' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ 
      message: 'Failed to create auction',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Submit a bid 
exports.submitBid = async (req, res) => {
  const { auctionId } = req.params;
  const { bidAmount } = req.body;

  try {
    const auction = await Auction.findById(auctionId).populate('product');

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if the auction has ended
    if (new Date() > auction.endTime || auction.status === 'ended') {
      return res.status(400).json({ message: 'This auction has already ended.' });
    }

    const highestBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startingPrice;
    if (bidAmount <= highestBid) {
      return res.status(400).json({ message: 'Bid must be higher than the current highest bid' });
    }

    auction.bids.push({
      user: req.user.id,
      amount: bidAmount,
      time: Date.now(),
    });

    await auction.save();

    // Add notification for the farmer
    const farmerNotification = new Notification({
      user: auction.product.user,
      message: `A new bid of $${bidAmount} was placed on your product "${auction.product.title}".`,
      type: 'bid'
    });
    await farmerNotification.save();

    // Notification for the previous highest bidder
    if (auction.bids.length > 1) {
      const previousBidderId = auction.bids[auction.bids.length - 2].user;
      const outbidNotification = new Notification({
        user: previousBidderId,
        message: `You have been outbid on the auction for "${auction.product.title}".`,
        type: 'bid'
      });
      await outbidNotification.save();
    }

    res.status(200).json(auction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.endAuction = async (req, res) => {
  const { auctionId } = req.params;

  try {
    const auction = await Auction.findById(auctionId).populate('product');
    
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Ensure the auction is not already ended
    if (auction.status === 'ended') {
      return res.status(400).json({ message: 'Auction already ended' });
    }

    // Find the highest bid
    if (auction.bids.length === 0) {
      return res.status(400).json({ message: 'No bids were placed for this auction.' });
    }

    const highestBid = auction.bids[auction.bids.length - 1];
    
    // Update auction to set the winner and end status
    auction.winningBid = highestBid;
    auction.status = 'ended';

    // Create a Stripe Payment Intent for the winning bid amount
    const paymentIntent = await stripe.paymentIntents.create({
      amount: highestBid.amount * 100, // Stripe uses cents
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        auctionId: auction._id.toString(),
        productId: auction.product._id.toString()
      }
    });

    auction.paymentIntentId = paymentIntent.id; // Link the payment intent to the auction
    await auction.save();

    res.status(200).json({
      message: 'Auction ended successfully. Payment required from winning bidder.',
      auction,
      paymentIntentClientSecret: paymentIntent.client_secret
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Accept a bid
exports.acceptBid = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { acceptedPrice } = req.body;
    
    // Get farmer ID from req.user.id (JWT decoding provides id, not _id)
    const farmerId = req.user.id;
    
    if (!farmerId) {
      console.error('No farmer ID found in request:', { user: req.user });
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required',
        debug: { user: req.user }
      });
    }

    // Find the auction and populate product details
    const auction = await Auction.findById(auctionId)
      .populate({
        path: 'product',
        populate: {
          path: 'user',
          model: 'User'
        }
      });
    
    if (!auction) {
      return res.status(404).json({ success: false, message: 'Auction not found' });
    }

    if (!auction.product) {
      return res.status(400).json({ success: false, message: 'Auction product not found' });
    }

    if (!auction.product.user) {
      return res.status(400).json({ success: false, message: 'Product owner not found' });
    }

    // Check if auction has any bids
    if (!auction.bids || auction.bids.length === 0) {
      return res.status(400).json({ success: false, message: 'This auction has no bids to accept' });
    }

    // If no specific price provided, accept the highest bid
    let winningBid;
    if (!acceptedPrice) {
      winningBid = auction.bids.reduce((highest, current) => 
        current.amount > highest.amount ? current : highest
      , auction.bids[0]);
      console.log('No price specified, accepting highest bid:', winningBid);
    } else {
      // Convert acceptedPrice to number for comparison
      const numericAcceptedPrice = Number(acceptedPrice);
      console.log('Bid amounts:', {
        acceptedPrice,
        numericAcceptedPrice,
        bids: auction.bids.map(b => ({ amount: b.amount, type: typeof b.amount }))
      });
      
      winningBid = auction.bids.find(bid => Number(bid.amount) === numericAcceptedPrice);
      console.log('Looking for bid with price:', numericAcceptedPrice, 'Found:', winningBid);
    }

    if (!winningBid) {
      return res.status(400).json({ 
        success: false, 
        message: 'No matching bid found for the accepted price',
        acceptedPrice,
        availableBids: auction.bids.map(bid => ({ 
          amount: bid.amount, 
          time: bid.time,
          type: typeof bid.amount 
        }))
      });
    }

    console.log('Debug - IDs:', {
      auctionId: auction._id.toString(),
      productId: auction.product._id.toString(),
      productUserId: auction.product.user._id.toString(),
      farmerId: farmerId,
      reqUser: req.user,
      winningBid: {
        amount: winningBid.amount,
        userId: winningBid.user.toString()
      }
    });

    // Verify that the farmer owns this auction
    const productOwnerId = auction.product.user._id.toString();
    const requestingFarmerId = farmerId;

    if (productOwnerId !== requestingFarmerId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to accept bids for this auction',
        debug: {
          productOwnerId,
          requestingFarmerId
        }
      });
    }

    // Verify auction is still active
    if (auction.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot accept bids for an inactive auction' });
    }

    try {
      // Create a payment intent for the winning amount
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(winningBid.amount * 100), // Convert to cents and ensure it's an integer
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          auctionId: auction._id.toString(),
          productId: auction.product._id.toString()
        }
      });

      // Update auction status and save winning bid info
      auction.status = 'ended';  // Changed from 'completed' to 'ended' to match enum
      auction.winningBid = winningBid;
      auction.paymentIntentId = paymentIntent.id;
      auction.acceptedAt = new Date();
      auction.endTime = new Date(); // Set end time to now since auction is ended
      await auction.save();

      // Update product availability using mongoose model
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: auction.product._id },
        {
          $set: {
            isAvailable: false,
            lastSoldPrice: winningBid.amount,
            lastSoldDate: new Date()
          }
        },
        { new: true }  // Return the updated document
      );

      if (!updatedProduct) {
        console.warn('Product not found or not updated:', auction.product._id);
      }

      // Notify the winner
      const winnerNotification = new Notification({
        user: winningBid.user,
        message: `Congratulations! The farmer has accepted your bid of $${winningBid.amount} for "${auction.product.title}". Please complete your payment.`,
        type: 'payment',  // Changed from 'bid_accepted' to 'payment'
        metadata: {
          auctionId: auction._id,
          paymentIntentClientSecret: paymentIntent.client_secret
        }
      });
      await winnerNotification.save();

      // Notify other bidders
      const otherBids = auction.bids.filter(bid => bid.user.toString() !== winningBid.user.toString());
      const otherBidderNotifications = otherBids.map(bid => ({
        user: bid.user,
        message: `The auction for "${auction.product.title}" has ended. Your bid was not accepted.`,
        type: 'bid',  // Changed from 'bid_not_accepted' to 'bid'
        metadata: { auctionId: auction._id }
      }));
      
      if (otherBidderNotifications.length > 0) {
        await Notification.insertMany(otherBidderNotifications);
      }

      // Notify the farmer
      const farmerNotification = new Notification({
        user: farmerId,
        message: `You have successfully accepted a bid of $${winningBid.amount} for "${auction.product.title}". The buyer will be notified to complete the payment.`,
        type: 'fulfillment',  // Changed from 'bid_accepted_by_farmer' to 'fulfillment'
        metadata: { auctionId: auction._id }
      });
      await farmerNotification.save();

      res.json({
        success: true,
        message: 'Bid accepted successfully',
        auction: {
          ...auction.toObject(),
          paymentIntentClientSecret: paymentIntent.client_secret
        }
      });

    } catch (stripeError) {
      console.error('Stripe or database error:', stripeError);
      res.status(500).json({ 
        success: false, 
        message: 'Error processing payment or updating auction status',
        error: stripeError.message
      });
    }

  } catch (error) {
    console.error('Error accepting bid:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error accepting bid',
      error: error.message
    });
  }
};

// Create payment intent for auction
const createPaymentIntent = async (req, res) => {
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
const handlePaymentWebhook = async (req, res) => {
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
