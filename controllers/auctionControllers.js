const Auction = require('../models/Auctions');
const Product = require('../models/Product');

// Create a new auction
exports.createAuction = async (req, res) => {
  const { productId, startingBid, endTime } = req.body;

  try {
    // Check if productId, startingBid, and endTime are provided
    if (!productId || !startingBid || !endTime) {
      return res.status(400).json({ message: 'Product ID, starting bid, and end time are required' });
    }

    // Log the productId, startingBid, and endTime
    console.log('Product ID:', productId, 'Starting Bid:', startingBid, 'End Time:', endTime);

    // Check if the product exists and belongs to the logged-in farmer
    const product = await Product.findById(productId).populate('user');
    
    // Log product details
    if (!product) {
      console.log('Product not found');
      return res.status(404).json({ message: 'Product not found' });
    }
    
    console.log('Product found:', product);
    
    if (product.user._id.toString() !== req.user.id) {
      console.log('User not authorized to auction this product');
      return res.status(403).json({ message: 'You are not authorized to auction this product' });
    }

    // Log before auction creation
    console.log('Creating auction for product:', productId);

    // Create a new auction for the product
    const newAuction = new Auction({
      product: productId,
      startingPrice: startingBid,  // Correct field name for starting price
      endTime, // Include the end time for the auction
      bids: [] // Start without bids; bids will be added later by buyers
    });

    await newAuction.save();

    // Log after successful auction creation
    console.log('Auction created successfully', newAuction);

    res.status(201).json(newAuction);
  } catch (err) {
    // Log the error message
    console.error('Error in auction creation:', err.message);

    // Handle errors during auction creation
    res.status(500).json({ error: err.message });
  }
};
