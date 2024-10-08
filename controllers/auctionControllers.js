const Auction = require('../models/Auctions');
const Product = require('../models/Product');  // Ensure Product model is correctly imported

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
      bids: [],
    });

    await newAuction.save();
    res.status(201).json(newAuction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all auctions (existing function)
exports.getAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find().populate('product');
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Submit a bid (new function)
exports.submitBid = async (req, res) => {
  const { auctionId } = req.params;
  const { bidAmount } = req.body;

  try {
    const auction = await Auction.findById(auctionId).populate('product');

    // Check if auction exists and is still ongoing
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Check if the bid is higher than the highest bid or starting price
    const highestBid = auction.bids.length > 0 ? auction.bids[auction.bids.length - 1].amount : auction.startingPrice;
    if (bidAmount <= highestBid) {
      return res.status(400).json({ message: 'Bid must be higher than the current highest bid' });
    }

    // Add the new bid to the auction
    auction.bids.push({
      bidder: req.user.id,  // The logged-in user placing the bid
      amount: bidAmount,
      time: Date.now(),
    });

    await auction.save();  // Save the auction with the new bid
    res.status(200).json(auction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get auctions created by the logged-in farmer (existing function)
exports.getFarmerAuctions = async (req, res) => {
  try {
    // Step 1: Find all auctions and populate the 'product' field
    const auctions = await Auction.find().populate('product');

    // Step 2: Filter auctions where the product's user matches the logged-in farmer
    const farmerAuctions = auctions.filter(auction => auction.product && auction.product.user.toString() === req.user.id);

    // Step 3: Return a response based on the filtered auctions
    if (farmerAuctions.length === 0) {
      return res.status(404).json({ message: 'No auctions found for this farmer' });
    }

    res.json(farmerAuctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

