const Auction = require('../models/Auctions');
const Product = require('../models/Product'); // Ensure the product model is used

// Create a new auction
exports.createAuction = async (req, res) => {
  const { productId, startingBid } = req.body;

  try {
    // Check if the product exists and belongs to the logged-in farmer
    const product = await Product.findById(productId);
    if (!product || product.user.toString() !== req.user.id) {
      return res.status(404).json({ message: 'Product not found or you are not authorized to auction this product' });
    }

    // Create a new auction for the product
    const newAuction = new Auction({
      product: productId,
      startingBid,
      bids: [] // Start without bids; bids will be added later by buyers
    });

    await newAuction.save();
    res.status(201).json(newAuction);

  } catch (err) {
    // Handle errors during auction creation
    res.status(500).json({ error: err.message });
  }
};

// Get auctions created by the logged-in farmer
exports.getFarmerAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find({ 'product.user': req.user.id }).populate('product');
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all auctions (for buyers)
exports.getAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find().populate('product');
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
