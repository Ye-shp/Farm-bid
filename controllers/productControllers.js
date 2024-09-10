const Product = require('../models/Product');

exports.createProduct = async (req, res) => {
  console.log("Incoming product creation request:", req.body);
  const { title, description } = req.body;

  try {
    const newProduct = new Product({ title, description, user: req.user.id });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFarmerProducts = async (req, res) => {
  try {
    const products = await Product.find({ user: req.user.id });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
