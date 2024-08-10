const Auction = require('../models/Auction');

exports.createAuction = async (req, res) => {
  const { productId } = req.body;
  
  try {
    const newAuction = new Auction({
      product: productId,
    });
    await newAuction.save();
    res.status(201).json(newAuction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getFarmerAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find({ 'product.user': req.user.id }).populate('product');
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAuctions = async (req, res) => {
  try {
    const auctions = await Auction.find().populate('product');
    res.json(auctions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
