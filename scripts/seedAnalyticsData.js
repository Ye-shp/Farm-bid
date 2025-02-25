const mongoose = require('mongoose');
const { Product } = require('../models/Product');
const Auction = require('../models/Auction');
const Order = require('../models/Order');
require('dotenv').config();

// Helper function to generate random date within range
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Helper function to generate random price
const randomPrice = (min, max) => {
  return Number((Math.random() * (max - min) + min).toFixed(2));
};

async function generateAuctionsForProduct(productId, farmerId, startDate, endDate) {
  const auctions = [];
  const numAuctions = Math.floor(Math.random() * 10) + 5; // 5-15 auctions

  for (let i = 0; i < numAuctions; i++) {
    const startPrice = randomPrice(10, 50);
    const auctionStartDate = randomDate(startDate, endDate);
    const auctionEndDate = new Date(auctionStartDate.getTime() + (Math.random() * 7 * 24 * 60 * 60 * 1000)); // 0-7 days

    const numBids = Math.floor(Math.random() * 8) + 2; // 2-10 bids
    const bids = [];
    let currentPrice = startPrice;

    // Generate bids
    for (let j = 0; j < numBids; j++) {
      currentPrice += randomPrice(1, 5);
      bids.push({
        amount: currentPrice,
        timestamp: randomDate(auctionStartDate, auctionEndDate),
        user: new mongoose.Types.ObjectId(), // Random user ID
      });
    }

    // Sort bids by timestamp
    bids.sort((a, b) => a.timestamp - b.timestamp);

    const auction = {
      product: productId,
      farmer: farmerId,
      startingPrice: startPrice,
      currentPrice: bids[bids.length - 1].amount,
      quantity: Math.floor(Math.random() * 100) + 50,
      startTime: auctionStartDate,
      endTime: auctionEndDate,
      status: new Date() > auctionEndDate ? 'ended' : 'active',
      bids: bids,
      winningBid: bids[bids.length - 1],
      delivery: Math.random() > 0.5,
    };

    auctions.push(auction);
  }

  return auctions;
}

async function generateOrdersForAuctions(auctions) {
  const orders = [];

  for (const auction of auctions) {
    if (auction.status === 'ended' && auction.winningBid) {
      const order = {
        auction: auction._id,
        product: auction.product,
        buyer: auction.winningBid.user,
        seller: auction.farmer,
        amount: auction.winningBid.amount * auction.quantity,
        quantity: auction.quantity,
        status: Math.random() > 0.1 ? 'fulfilled' : 'pending', // 90% fulfilled
        createdAt: new Date(auction.endTime.getTime() + 1000 * 60 * 60), // 1 hour after auction end
        paymentStatus: 'completed',
        delivery: auction.delivery,
        // Add a mock payment intent ID
        paymentIntentId: `pi_mock_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
      };

      orders.push(order);
    }
  }

  return orders;
}

async function seedAnalyticsData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Get all products
    const products = await Product.find();
    console.log(`Found ${products.length} products`);

    // Clear existing auctions and orders
    await Auction.deleteMany({});
    await Order.deleteMany({});
    console.log('Cleared existing auctions and orders');

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90); // 90 days of history

    // Generate auctions and orders for each product
    for (const product of products) {
      console.log(`Generating data for product: ${product.title || product.customProduct}`);

      // Generate and save auctions
      const auctions = await generateAuctionsForProduct(
        product._id,
        product.user,
        startDate,
        endDate
      );
      const savedAuctions = await Auction.create(auctions);
      console.log(`Created ${savedAuctions.length} auctions`);

      // Generate and save orders
      const orders = await generateOrdersForAuctions(savedAuctions);
      await Order.create(orders);
      console.log(`Created ${orders.length} orders`);
    }

    console.log('Analytics data seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding analytics data:', error);
    process.exit(1);
  }
}

seedAnalyticsData();
