const Auction = require('../models/Auctions'); // Ensure the correct model name is used

// Create a new auction
exports.createAuction = async (req, res) => {
  const { productId, startingBid } = req.body; // Include the startingBid in the request body
  
  try {
    // Create a new auction with the associated product ID and starting bid
    const newAuction = new Auction({
      product: productId,
      bids: [{ amount: startingBid, user: req.user.id }] // Assuming the first bid is made by the farmer themselves
    });
    await newAuction.save();

    // Respond with the newly created auction
    res.status(201).json(newAuction);
  } catch (err) {
    // Handle any errors during auction creation
    res.status(500).json({ error: err.message });
  }
};

// Get auctions for the logged-in farmer
exports.getFarmerAuctions = async (req, res) => {
  try {
    // Find auctions where the product's user matches the logged-in farmer
    const auctions = await Auction.find({ 'product.user': req.user.id }).populate('product');
    res.json(auctions);
  } catch (err) {
    // Handle any errors in fetching farmer auctions
    res.status(500).json({ error: err.message });
  }
};

// Get all auctions (for buyers)
exports.getAuctions = async (req, res) => {
  try {
    // Find all auctions and populate the associated product details
    const auctions = await Auction.find().populate('product');
    res.json(auctions);
  } catch (err) {
    // Handle any errors in fetching all auctions
    res.status(500).json({ error: err.message });
  }
};
