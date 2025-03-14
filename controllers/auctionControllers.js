const Auction = require('../models/Auction');  // Changed from '../models/Auctions'
const { Product } = require('../models/Product');
const mongoose = require('mongoose');
const {NotificationModel} = require('../models/Notification');
const PaymentService = require('../services/paymentService');
const {
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  PRIORITY_LEVELS,
  DELIVERY_CHANNELS,
} = require("../models/Notification");
const notificationService = require("../services/notificationService");

//Error in checkAndUpdateExpiredAuctions: TypeError: Cannot read properties of null (reading '_id')
const checkAndUpdateExpiredAuctions = async () => {
  const currentTime = new Date();

  try {
    // Find all active auctions that have passed their end time
    const expiredAuctions = await Auction.find({
      status: "active",
      endTime: { $lt: currentTime },
    }).populate("product");

    for (const auction of expiredAuctions) {
      // If there are bids, set the winner
      if (auction.bids.length > 0) {
        const winningBid = auction.bids[auction.bids.length - 1];
        auction.winningBid = winningBid;

        // Use PaymentService to handle payment intent creation
        const { paymentIntent } = await PaymentService.handleAuctionEnd(
          auction
        );
        auction.paymentIntentId = paymentIntent.id;

        // Notify the winner
        await notificationService.createAndSendNotification({
          user: winningBid.user,
          message: `Congratulations! You won the auction for "${auction.product.title}" with a bid of $${winningBid.amount}. Please complete your payment.`,
          type: "auction_won",
          metadata: {
            auctionId: auction._id,
            paymentIntentClientSecret: paymentIntent.client_secret,
          },
        });

        // Notify the farmer
        await notificationService.createAndSendNotification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with a winning bid of $${winningBid.amount}.`,
          type: "auction_ended",
          metadata: {
            auctionId: auction._id,
          },
        });
      } else {
        // Notify the farmer that no bids were placed
        await notificationService.createAndSendNotification({
          user: auction.product.user,
          message: `Your auction for "${auction.product.title}" has ended with no bids.`,
          type: "auction_ended_no_bids",
        });
      }

      auction.status = "ended";
      await auction.save();
    }
  } catch (error) {
    console.error("Error in checkAndUpdateExpiredAuctions:", error);
  }
};

// Modified getAuctions to exclude ended auctions by default
exports.getAuctions = async (req, res) => {
  try {
    // First, check for any expired auctions
    await checkAndUpdateExpiredAuctions();

    // Only fetch active auctions by default
    const showEnded = req.query.showEnded === "true";
    const query = showEnded ? {} : { status: "active" };

    const auctions = await Auction.find(query).populate("product");

    const updatedAuctions = auctions.map((auction) => {
      const highestBid =
        auction.bids.length > 0
          ? Math.max(...auction.bids.map((bid) => bid.amount))
          : auction.startingPrice;

      return {
        ...auction.toObject(),
        highestBid,
        status: auction.status,
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
    const query = { "product.user": farmerId };
    if (status) {
      query.status = status;
    }

    const auctions = await Auction.find(query)
      // .select('_id product startingPrice currentPrice endTime auctionQuantity status')
      .populate({
        path: "product",
        populate: { path: "user" },
      })
      .sort({ createdAt: -1 });

    res.json(auctions);
  } catch (error) {
    console.error("Error in getFarmerAuctions:", error);
    res.status(500).json({ message: "Error fetching farmer auctions" });
  }
};

// Get auction details including winner info
exports.getAuctionDetails = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.auctionId)
      .populate({
        path: "product",
        populate: { path: "user" },
      })
      .populate("bids.user", "name email");

    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    res.json(auction);
  } catch (error) {
    console.error("Error in getAuctionDetails:", error);
    res.status(500).json({ message: "Error fetching auction details" });
  }
};

// Create a new auction
exports.createAuction = async (req, res) => {
  try {
    const {
      productId,
      startingPrice,
      endTime,
      minIncrement,
      auctionQuantity,
      delivery,
    } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (product.totalQuantity < auctionQuantity) {
      return res.status(404).json({
        message: "Auction quantity is larger than available quantity",
      });
    }
    product.totalQuantity -= auctionQuantity;
    await product.save();

    const auction = new Auction({
      product: productId,
      farmer: req.user.id,         
      startingPrice,
      currentPrice: startingPrice,
      quantity: auctionQuantity,     
      startTime: new Date(),         
      minIncrement,
      delivery,
      endTime,
      status: "active",
    });

    await auction.save();
    res.status(201).json(auction);
  } catch (error) {
    console.error("Error in createAuction:", error);
    res.status(500).json({ message: "Error creating auction" });
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
      return res.status(400).json({ message: "Invalid auction ID format" });
    }

    const auction = await Auction.findById(auctionId).populate({
      path: "product",
      populate: { path: "user" },
    });
    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    if (auction.status !== "active") {
      return res.status(400).json({ message: "This auction has ended" });
    }

    const currentHighestBid =
      auction.bids.length > 0
        ? Math.max(...auction.bids.map((bid) => bid.amount))
        : auction.startingPrice;

    if (bidAmount <= currentHighestBid) {
      return res
        .status(400)
        .json({ message: "Bid must be higher than current highest bid" });
    }

    auction.bids.push({
      user: userId,
      amount: bidAmount,
      time: new Date(),
    });

    auction.currentPrice = bidAmount;
    await auction.save();

    // Create notification for previous highest bidder
    if (auction.bids.length > 1) {
      const previousBidder = auction.bids[auction.bids.length - 2].user;

      // Cross check with contract controler //
      //creates a notification in mongodb. On success, the created object is returned
      const notification = await NotificationModel.create({
        user: previousBidder,
        title: "new bidder",
        message: `Your bid on "${auction.product.title}" has been outbid. New highest bid: $${bidAmount}`,
        category: "auction",
        priority: "high",
        type: "auction_bid_outbid",
        metadata: { auctionId: auction._id },
      });

      //if notification is undefined, a not created error is thrown
      if (!notification) {
        throw new Error("could not create notification in database");
      }

      //if notiication was created, the notification is sent using webhook to the frontend
      const io = req.app.get("io");
      io.to(`user_${previousBidder}`).emit("notificationUpdate", notification);
    }

    res.json(auction);
  } catch (error) {
    console.error("Error in submitBid:", error);
    res.status(500).json({ message: error.message || "Error submitting bid" });
  }
};

// End auction
exports.endAuction = async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.auctionId);
    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    auction.status = "ended";
    await auction.save();

    res.json({ message: "Auction ended successfully" });
  } catch (error) {
    console.error("Error in endAuction:", error);
    res.status(500).json({ message: "Error ending auction" });
  }
};

// Accept a bid
// Notification works properly
exports.acceptBid = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { bidId } = req.body;
    const io = req.app.get("io");

    // Validate auctionId format
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({ message: "Invalid auction ID format" });
    }

    const auction = await Auction.findById(auctionId)
      .populate({
        path: "product",
        populate: { path: "user" },
      })
      .populate("bids.user");

    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    // Authorization check
    if (auction.product.user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized to accept bids" });
    }

    const winningBid = auction.bids.find((bid) => bid._id.equals(bidId));
    if (!winningBid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    // Convert values to numbers and calculate total amount
    const unitPrice = parseFloat(winningBid.amount);
    const quantity = parseFloat(auction.quantity);
    const totalAmount = unitPrice * quantity;

    // Create payment intent with the total amount
    const { client_secret, status, id, fees, transaction } =
      await PaymentService.createPaymentIntent({
        amount: totalAmount,
        sourceType: "auction",
        sourceId: auction._id.toString(),
        buyerId: winningBid.user._id.toString(),
        sellerId: auction.product.user._id.toString(),
        metadata: {
          auctionId: auction._id.toString(),
          productId: auction.product._id.toString(),
          bidId: winningBid._id.toString(),
          deliveryMethod: auction.delivery ? "delivery" : "pickup",
          quantity: auction.quantity,
          pricePerUnit: winningBid.amount,
        },
      });

    // Update auction status and record the winning bid
    auction.paymentIntentId = id;
    auction.status = "ended";
    auction.winningBid = {
      user: winningBid.user._id,
      amount: winningBid.amount,
      time: new Date(),
    };
    auction.acceptedAt = new Date();
    await auction.save();

    // Create buyer notification
    const buyerNotification = await NotificationModel.create({
      user: winningBid.user._id,
      title: "Bid Accepted",
      message: `Congratulations! Your bid of $${winningBid.amount} was accepted for "${auction.product.title}". Click here to complete your payment.`,
      category: NOTIFICATION_CATEGORIES.AUCTION,
      priority: PRIORITY_LEVELS.HIGH,
      type: "auction_won",
      metadata: {
        auctionId: auction._id,
        amount: winningBid.amount,
        title: auction.product.title,
        paymentIntentClientSecret: client_secret,
      },
    });

    if (!buyerNotification) {
      throw new Error("Could not create buyer notification");
    }

    // Create seller notification
    const sellerNotification = await NotificationModel.create({
      user: auction.product.user._id,
      title: "Auction Completed",
      message: `A bid of $${winningBid.amount} has been accepted for your auction "${auction.product.title}".`,
      category: NOTIFICATION_CATEGORIES.AUCTION,
      priority: PRIORITY_LEVELS.MEDIUM,
      type: "auction_ended",
      metadata: {
        auctionId: auction._id,
        amount: winningBid.amount,
        title: auction.product.title,
      },
    });

    if (!sellerNotification) {
      throw new Error("Could not create seller notification");
    }

    // Emit real-time notifications to both buyer and seller
    io.to(`user_${winningBid.user._id}`).emit("notificationUpdate", buyerNotification);
    io.to(`user_${auction.product.user._id}`).emit("notificationUpdate", sellerNotification);

    res.json({
      message: "Bid accepted successfully",
      auction,
      notifications: {
        buyer: winningBid.user,
        seller: auction.product.user,
      },
    });
  } catch (error) {
    console.error("Error accepting bid:", error);
    res.status(500).json({ error: error.message });
  }
};


// Create payment intent for auction
exports.createPaymentIntent = async (req, res) => {
  try {
    const { auctionId } = req.params;

    // Validate auctionId format
    if (!mongoose.Types.ObjectId.isValid(auctionId)) {
      return res.status(400).json({ message: "Invalid auction ID format" });
    }

    const auction = await Auction.findById(auctionId)
      .populate({
        path: "product",
        populate: { path: "user" },
      })
      .populate("bids.user");

    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    // Ensure the auction has an accepted bid
    if (!auction.winningBid) {
      return res
        .status(400)
        .json({ message: "Auction does not have an accepted bid yet" });
    }

    // Verify that the requesting user is the winner
    if (auction.winningBid.user.toString() !== req.user.id.toString()) {
      return res
        .status(403)
        .json({ message: "Only the auction winner can make payment" });
    }

    // Find the matching bid details
    const matchingBid = auction.bids.find(
      (bid) =>
        bid.user._id.toString() === auction.winningBid.user.toString() &&
        bid.amount === auction.winningBid.amount
    );

    if (!matchingBid) {
      return res
        .status(400)
        .json({ message: "Winning bid details could not be found" });
    }

    // Calculate total amount based on winning bid amount * quantity
    const totalAmount = auction.winningBid.amount * auction.quantity;

    const paymentData = await PaymentService.createPaymentIntent({
      amount: totalAmount, // Changed from auction.winningBid.amount
      sourceType: "auction",
      sourceId: auction._id.toString(),
      buyerId: auction.winningBid.user.toString(),
      sellerId: auction.product.user.id.toString(),
      metadata: {
        auctionId: auction._id.toString(),
        productId: auction.product._id.toString(),
        bidId: matchingBid._id.toString(),
        deliveryMethod: auction.delivery ? "delivery" : "pickup",
        quantity: auction.quantity,
        pricePerUnit: auction.winningBid.amount
      },
    });

    // Update auction with payment intent ID
    if (paymentData.id) {
      auction.paymentIntentId = paymentData.id;
      await auction.save();
    }

    // Return complete payment intent data
    res.json({
      client_secret: paymentData.client_secret,
      status: paymentData.status,
      sourceId: auction._id.toString(),
      sellerId: auction.product.user._id.toString(),
      id: paymentData.id,
      amount: totalAmount,
      fees: paymentData.fees,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: error.message });
  }
};

// Handle successful payment webhook
exports.handlePaymentWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = PaymentService.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook Error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object;
    const { auctionId } = paymentIntent.metadata;

    try {
      const auction = await Auction.findById(auctionId);
      if (auction) {
        auction.status = "paid";
        await auction.save();

        // Create notifications for both buyer and seller
        const winningBid = auction.bids[auction.bids.length - 1];

        await notificationService.createAndSendNotification({
          user: winningBid.user,
          message: `Payment successful for auction "${auction.title}". The seller will be notified to fulfill your order.`,
          type: "payment_success",
        });

        await notificationService.createAndSendNotification({
          user: auction.product.user,
          message: `Payment received for auction "${auction.title}". Please proceed with order fulfillment.`,
          type: "payment_received",
        });
      }
    } catch (error) {
      console.error("Error processing successful payment:", error);
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
  handlePaymentWebhook: exports.handlePaymentWebhook,
};
