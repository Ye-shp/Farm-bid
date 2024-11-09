// controllers/openContractControllers.js
const OpenContract = require('../models/OpenContract');
const Notification = require('../models/Notification');

// Create a new open contract (for buyers)
exports.createOpenContract = async (req, res) => {
  const { productType, quantity, maxPrice, endTime } = req.body;

  try {
    const newContract = new OpenContract({
      buyer: req.user.id,
      productType,
      quantity,
      maxPrice,
      endTime,
      status: 'open',
      fulfillments: [],
    });

    await newContract.save();
    res.status(201).json(newContract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all open contracts (for farmers to view)
exports.getOpenContracts = async (req, res) => {
  try {
    const contracts = await OpenContract.find({ status: 'open' }).populate('buyer', 'username location');
    res.json(contracts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Fulfill an open contract (for farmers)
exports.fulfillOpenContract = async (req, res) => {
  const { contractId } = req.params;
  const { quantity, price } = req.body;

  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ message: 'Open contract not found' });
    }

    if (new Date() > contract.endTime || contract.status !== 'open') {
      return res.status(400).json({ message: 'This contract has already ended or is not open.' });
    }

    contract.fulfillments.push({
      farmer: req.user.id,
      quantity,
      price,
    });

    await contract.save();

    // Notify the buyer
    const buyerNotification = new Notification({
      user: contract.buyer,
      message: `Your contract for ${contract.productType} has a new fulfillment offer from a farmer.`,
      type: 'fulfillment'
    });
    await buyerNotification.save();

    res.status(200).json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Close an open contract (for buyers)
exports.closeOpenContract = async (req, res) => {
  const { contractId } = req.params;

  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ message: 'Open contract not found' });
    }

    if (contract.buyer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to close this contract' });
    }

    contract.status = 'closed';
    await contract.save();

    res.status(200).json({ message: 'Contract closed successfully.', contract });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get contracts created by the logged-in buyer
exports.getBuyerContracts = async (req, res) => {
  try {
    const contracts = await OpenContract.find({ buyer: req.user.id });
    res.json(contracts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
