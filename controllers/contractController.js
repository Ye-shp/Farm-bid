// controllers/openContractControllers.js
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const Notification = require('../models/Notification');
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = twilio(accountSid, authToken);

// Helper function to create notifications
async function createNotification(userId, message, type) {
  try {
    const notification = new Notification({
      user: userId,
      message,
      type,
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// Helper function to notify farmers about new contracts
async function notifyRelevantFarmers(contract) {
  try {
    // Find farmers who have products matching the contract requirements
    const relevantFarmers = await User.find({
      role: 'farmer',
      'products.name': contract.productType,
    });

    const notifications = [];
    for (const farmer of relevantFarmers) {
      if (!contract.notifiedFarmers.includes(farmer._id)) {
        // Create in-app notification
        const notification = await createNotification(
          farmer._id,
          `New contract available for ${contract.productType}. Quantity: ${contract.quantity}, Max Price: $${contract.maxPrice}`,
          'contract'
        );

        // Send SMS if phone number is available
        if (farmer.phone) {
          try {
            await client.messages.create({
              body: `New contract opportunity on Elipae: ${contract.quantity} units of ${contract.productType} needed. Max price: $${contract.maxPrice}. Log in to view details.`,
              to: farmer.phone,
              messagingServiceSid,
            });
          } catch (smsError) {
            console.error('SMS notification failed:', smsError);
          }
        }

        // Add farmer to notified list
        contract.notifiedFarmers.push(farmer._id);
        notifications.push(notification);
      }
    }

    await contract.save();
    return notifications;
  } catch (error) {
    console.error('Error notifying farmers:', error);
    return [];
  }
}

// Create a new open contract
exports.createOpenContract = async (req, res) => {
  try {
    const { 
      productType, 
      productCategory, 
      quantity, 
      maxPrice, 
      endTime,
      deliveryMethod,
      deliveryAddress 
    } = req.body;

    // Validate required fields
    if (!productType || !productCategory || !quantity || !maxPrice || !endTime) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide productType, productCategory, quantity, maxPrice, and endTime.' 
      });
    }

    // Validate quantity and price
    if (quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0.' });
    }
    if (maxPrice <= 0) {
      return res.status(400).json({ error: 'Maximum price must be greater than 0.' });
    }

    // Validate end time
    const endTimeDate = new Date(endTime);
    const now = new Date();
    if (endTimeDate <= now) {
      return res.status(400).json({ error: 'End time must be in the future.' });
    }

    // Validate delivery method if provided
    if (deliveryMethod && !['buyer_pickup', 'farmer_delivery', 'third_party'].includes(deliveryMethod)) {
      return res.status(400).json({ error: 'Invalid delivery method.' });
    }

    // Validate delivery address if not buyer pickup
    if (deliveryMethod !== 'buyer_pickup' && !deliveryAddress) {
      return res.status(400).json({ error: 'Delivery address is required for delivery options.' });
    }

    const newContract = new OpenContract({
      buyer: req.user.id,
      productType,
      productCategory,
      quantity,
      maxPrice,
      endTime: endTimeDate,
      status: 'open',
      deliveryMethod: deliveryMethod || 'buyer_pickup',
      deliveryAddress: deliveryMethod !== 'buyer_pickup' ? deliveryAddress : null,
      fulfillments: [],
      notifiedFarmers: [],
      paymentStatus: 'pending'
    });

    await newContract.save();
    
    // Notify relevant farmers about the new contract
    await notifyRelevantFarmers(newContract);

    res.status(201).json(newContract);
  } catch (err) {
    console.error('Contract creation error:', err);
    res.status(500).json({ 
      error: err.message || 'An error occurred while creating the contract.' 
    });
  }
};

// Get all open contracts (for farmers to view)
exports.getOpenContracts = async (req, res) => {
  try {
    const contracts = await OpenContract.find({ 
      status: 'open',
      endTime: { $gt: new Date() }
    }).populate('buyer', 'username location');
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

    if (!contract.canBeFulfilled()) {
      return res.status(400).json({ 
        message: 'This contract has expired or is no longer open for fulfillment.' 
      });
    }

    if (price > contract.maxPrice) {
      return res.status(400).json({ 
        message: 'Offered price exceeds the maximum price set by the buyer.' 
      });
    }

    if (quantity > contract.quantity) {
      return res.status(400).json({ 
        message: 'Offered quantity exceeds the required quantity.' 
      });
    }

    const buyer = await User.findById(contract.buyer);
    const farmer = await User.findById(req.user.id);

    if (!buyer || !farmer) {
      return res.status(404).json({ message: 'Buyer or Farmer not found.' });
    }

    // Add the fulfillment offer
    contract.fulfillments.push({
      farmer: farmer._id,
      quantity,
      price,
      status: 'pending'
    });

    // Update contract status
    contract.status = 'pending_fulfillment';
    await contract.save();

    // Notify the buyer
    await createNotification(
      buyer._id,
      `Farmer ${farmer.username} has offered to fulfill your contract for ${contract.productType}.`,
      'fulfillment'
    );

    // Send SMS to buyer if phone available
    if (buyer.phone) {
      try {
        await client.messages.create({
          body: `Hello ${buyer.username}, farmer ${farmer.username} has offered to fulfill your contract for ${contract.productType}. Log in to Elipae to view details.`,
          to: buyer.phone,
          messagingServiceSid,
        });
      } catch (error) {
        console.error('Failed to send SMS:', error);
      }
    }

    res.status(200).json(contract);
  } catch (err) {
    console.error('Error fulfilling contract:', err);
    res.status(500).json({ error: err.message });
  }
};

// Accept a fulfillment offer (for buyers)
exports.acceptFulfillment = async (req, res) => {
  const { contractId, fulfillmentId } = req.params;

  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    if (contract.buyer.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to accept fulfillments for this contract' });
    }

    const fulfillment = contract.fulfillments.id(fulfillmentId);
    if (!fulfillment) {
      return res.status(404).json({ message: 'Fulfillment offer not found' });
    }

    // Update fulfillment status
    fulfillment.status = 'accepted';
    
    // Set winning fulfillment
    contract.winningFulfillment = {
      farmer: fulfillment.farmer,
      quantity: fulfillment.quantity,
      price: fulfillment.price,
      acceptedAt: new Date()
    };

    // Update contract status
    contract.status = 'fulfilled';
    await contract.save();

    // Notify the farmer
    const farmer = await User.findById(fulfillment.farmer);
    if (farmer) {
      await createNotification(
        farmer._id,
        `Your fulfillment offer for ${contract.productType} has been accepted!`,
        'fulfillment'
      );

      if (farmer.phone) {
        try {
          await client.messages.create({
            body: `Your offer to fulfill the contract for ${contract.productType} has been accepted! Log in to Elipae to view details.`,
            to: farmer.phone,
            messagingServiceSid,
          });
        } catch (error) {
          console.error('Failed to send SMS:', error);
        }
      }
    }

    res.json(contract);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get contracts for the current user (both buyer and farmer)
exports.getUserContracts = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    let contracts;

    const populateOptions = [
      { path: 'buyer', select: 'username email phone' },
      { path: 'fulfillments.farmer', select: 'username email phone' },
      { path: 'winningFulfillment.farmer', select: 'username email phone' }
    ];

    if (userRole === 'buyer') {
      // For buyers: get all contracts they created
      contracts = await OpenContract.find({ buyer: userId })
        .populate(populateOptions)
        .sort({ createdAt: -1 });
    } else {
      // For farmers: get contracts they've fulfilled or won, or that are open
      contracts = await OpenContract.find({
        $or: [
          { status: 'open' },
          { 'fulfillments.farmer': userId },
          { 'winningFulfillment.farmer': userId }
        ]
      })
        .populate(populateOptions)
        .sort({ createdAt: -1 });
    }

    res.json(contracts);
  } catch (error) {
    console.error('Error fetching user contracts:', error);
    res.status(500).json({ error: 'Error fetching contracts', details: error.message });
  }
};

// Get a single contract by ID
exports.getContractById = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    const contract = await OpenContract.findById(req.params.contractId)
      .populate('buyer', 'username email phone')
      .populate('fulfillments.farmer', 'username email phone')
      .populate('winningFulfillment.farmer', 'username email phone');

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if user has permission to view this contract
    const canView = 
      userRole === 'buyer' && contract.buyer.toString() === userId ||
      userRole === 'farmer' && (
        contract.status === 'open' ||
        contract.fulfillments.some(f => f.farmer.toString() === userId) ||
        (contract.winningFulfillment && contract.winningFulfillment.farmer.toString() === userId)
      );

    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view this contract' });
    }

    res.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Error fetching contract details', details: error.message });
  }
};
