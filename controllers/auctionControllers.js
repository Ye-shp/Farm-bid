const Auction = require('../models/Auctions');
const Product = require('../models/Product');  
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

    const { status } = req.query; // Can be 'active', 'ended', or undefined for all
    const query = { 'product.user': req.user.id };
    if (status) {
      query.status = status;
    }

    const auctions = await Auction.find(query).populate('product');
    const farmerAuctions = auctions
      .filter(auction => auction.product && auction.product.user.toString() === req.user.id)
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

    res.json(farmerAuctions);
  } catch (err) {
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
  const { productId, startingBid, endTime } = req.body;

  try {
    const product = await Product.findById(productId);
    if (!product || product.user.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Product not found or unauthorized' });
    }

    const newAuction = new Auction({
      product: productId,
      startingPrice: startingBid,
      endTime,
      status : 'active',
      bids: [],
    });

    await newAuction.save();
    res.status(201).json(newAuction);
  } catch (err) {
    res.status(500).json({ error: err.message });
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


