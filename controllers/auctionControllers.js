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
    // Find all auctions and populate the 'product' field
    const auctions = await Auction.find().populate('product');

    // Map through each auction to calculate the highest bid
    const updatedAuctions = auctions.map(auction => {
      // Calculate the highest bid or fallback to startingPrice
      const highestBid = auction.bids.length > 0
        ? Math.max(...auction.bids.map(bid => bid.amount))
        : auction.startingPrice;

      return {
        ...auction.toObject(),  // Convert the auction document to a plain object
        highestBid,  // Add highestBid to the response
      };
    });

    res.json(updatedAuctions);
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

// Get auctions created by the logged-in farmer 
exports.getFarmerAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find().populate('product');
    const farmerAuctions = auctions
      .filter(auction => auction.product && auction.product.user.toString() === req.user.id)
      .map(auction => {
        const highestBid = auction.bids.length > 0
          ? Math.max(...auction.bids.map(bid => bid.amount))
          : auction.startingPrice;
        const auctionStatus = new Date() > auction.endTime ? 'Ended' : 'Ongoing';

        // Return auction with the highest bid and status
        return {
          ...auction.toObject(),
          highestBid,
          status: auctionStatus
        };
      });

    if (farmerAuctions.length === 0) {
      return res.status(404).json({ message: 'No auctions found for this farmer' });
    }

    res.json(farmerAuctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


