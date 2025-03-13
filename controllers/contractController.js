// controllers/openContractControllers.js
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const {NotificationModel} = require('../models/Notification');
const twilio = require('twilio');
const Transaction = require('../models/Transaction');
const Payout = require('../models/Payout');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = twilio(accountSid, authToken);

// Helper function to create notifications
async function createNotification(userId, message, type) {
  try {
    const notification = new NotificationModel({
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

// Helper function to calculate next delivery date based on frequency
function calculateNextDeliveryDate(startDate, frequency) {
  const date = new Date(startDate);
  
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    default:
      return null;
  }
  
  return date;
}

// Helper function to generate recurring instances
function generateRecurringInstances(startDate, endDate, frequency) {
  const instances = [];
  let currentDate = new Date(startDate);
  let instanceNumber = 1;
  
  while (currentDate < new Date(endDate)) {
    const instanceEndDate = calculateNextDeliveryDate(currentDate, frequency);
    
    instances.push({
      instanceNumber,
      startDate: new Date(currentDate),
      endDate: instanceEndDate,
      status: instanceNumber === 1 ? 'active' : 'scheduled'
    });
    
    currentDate = new Date(instanceEndDate);
    instanceNumber++;
  }
  
  return instances;
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
      deliveryAddress,
      isRecurring,
      recurringFrequency,
      recurringEndDate
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
      return res.status(400).json({ error: 'Max price must be greater than 0.' });
    }

    // Validate end time
    const endTimeDate = new Date(endTime);
    if (endTimeDate <= new Date()) {
      return res.status(400).json({ error: 'End time must be in the future.' });
    }

    // Validate recurring contract fields if applicable
    if (isRecurring) {
      if (!recurringFrequency) {
        return res.status(400).json({ error: 'Recurring frequency is required for recurring contracts.' });
      }
      
      if (!recurringEndDate) {
        return res.status(400).json({ error: 'Recurring end date is required for recurring contracts.' });
      }
      
      const recurringEndDateObj = new Date(recurringEndDate);
      if (recurringEndDateObj <= endTimeDate) {
        return res.status(400).json({ error: 'Recurring end date must be after the initial contract end time.' });
      }
    }

    // Create contract object
    const contractData = {
      buyer: req.user._id,
      productType,
      productCategory,
      quantity,
      maxPrice,
      endTime: endTimeDate,
      deliveryMethod,
      deliveryAddress: deliveryMethod !== 'buyer_pickup' ? deliveryAddress : undefined,
      isRecurring: isRecurring || false
    };

    // Add recurring contract fields if applicable
    if (isRecurring) {
      contractData.recurringFrequency = recurringFrequency;
      contractData.recurringEndDate = new Date(recurringEndDate);
      contractData.nextDeliveryDate = calculateNextDeliveryDate(endTimeDate, recurringFrequency);
      contractData.recurringInstances = generateRecurringInstances(
        endTimeDate, 
        recurringEndDate, 
        recurringFrequency
      );
    }

    const contract = new OpenContract(contractData);
    await contract.save();

    // Notify relevant farmers
    await notifyRelevantFarmers(contract);

    // Create notification for buyer
    await createNotification(
      req.user._id,
      `Your contract for ${quantity} units of ${productType} has been created successfully.`,
      'contract'
    );

    res.status(201).json({
      message: 'Contract created successfully',
      contract
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ error: 'Failed to create contract. Please try again.' });
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
  try {
    const { contractId } = req.params;
    const { price, notes, deliveryMethod, deliveryFee, estimatedDeliveryDate } = req.body;
    const farmerId = req.user.id;

    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if contract is open
    if (contract.status !== 'open') {
      return res.status(400).json({ error: 'Contract is not open for fulfillment' });
    }

    // Check if farmer has already made an offer
    const existingFulfillment = contract.fulfillments.find(
      f => f.farmer.toString() === farmerId 
    );
    if (existingFulfillment) {
      return res.status(400).json({ error: 'You have already made an offer on this contract' });
    }

    // Validate price
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }
    if (price > contract.maxPrice) {
      return res.status(400).json({ error: 'Price exceeds maximum allowed price' });
    }

    // Add fulfillment
    contract.fulfillments.push({
      farmer: farmerId,
      price,
      notes: notes || '',
      deliveryMethod,
      deliveryFee: deliveryFee || 0,
      estimatedDeliveryDate,
      status: 'pending'
    });

    await contract.save();

    // Send notification to buyer
    await createNotification(
      contract.buyer,
      `New fulfillment offer received for contract: ${contract.productType}`,
      'contract_fulfillment'
    );

    res.json(contract);
  } catch (error) {
    console.error('Error in fulfillOpenContract:', error);
    res.status(500).json({ error: 'Failed to fulfill contract', details: error.message });
  }
};

// Accept a fulfillment offer (for buyers)
exports.acceptFulfillment = async (req, res) => {
  const { contractId, fulfillmentId } = req.params;

  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.buyer.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to accept fulfillments for this contract' });
    }

    const fulfillment = contract.fulfillments.id(fulfillmentId);
    if (!fulfillment) {
      return res.status(404).json({ error: 'Fulfillment offer not found' });
    }

    if (fulfillment.status !== 'pending') {
      return res.status(400).json({ error: 'This fulfillment offer is no longer pending' });
    }

    // Update fulfillment status
    fulfillment.status = 'accepted';
    fulfillment.acceptedAt = new Date();
    
    // Set winning fulfillment
    contract.winningFulfillment = {
      farmer: fulfillment.farmer,
      price: fulfillment.price,
      deliveryMethod: fulfillment.deliveryMethod,
      deliveryFee: fulfillment.deliveryFee,
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
        'fulfillment_accepted'
      );

      // Send SMS if phone number is available
      if (farmer.phone) {
        try {
          await client.messages.create({
            body: `Your offer to fulfill the contract for ${contract.productType} has been accepted! Log in to view details.`,
            to: farmer.phone,
            messagingServiceSid,
          });
        } catch (error) {
          console.error('Failed to send SMS:', error);
        }
      }
    }

    res.json(contract);
  } catch (error) {
    console.error('Error in acceptFulfillment:', error);
    res.status(500).json({ error: 'Failed to accept fulfillment', details: error.message });
  }
};

// Complete fulfillment (for farmers)
exports.completeFulfillment = async (req, res) => {
  const { contractId, fulfillmentId } = req.params;
  const { deliveryNotes, trackingNumber } = req.body;

  try {
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const fulfillment = contract.fulfillments.id(fulfillmentId);
    if (!fulfillment) {
      return res.status(404).json({ error: 'Fulfillment not found' });
    }

    if (fulfillment.farmer.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to complete this fulfillment' });
    }

    if (fulfillment.status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted fulfillments can be completed' });
    }

    // Update fulfillment
    fulfillment.status = 'completed';
    fulfillment.completedAt = new Date();
    fulfillment.actualDeliveryDate = new Date();
    fulfillment.deliveryNotes = deliveryNotes;
    fulfillment.trackingNumber = trackingNumber;

    // Update contract and winning fulfillment
    contract.status = 'completed';
    contract.winningFulfillment.completedAt = new Date();

    await contract.save();

    // Notify the buyer
    await createNotification(
      contract.buyer,
      `The contract for ${contract.productType} has been marked as completed by the farmer`,
      'fulfillment_completed'
    );

    res.json(contract);
  } catch (error) {
    console.error('Error in completeFulfillment:', error);
    res.status(500).json({ error: 'Failed to complete fulfillment', details: error.message });
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
      { path: 'fulfillments.farmer', select: 'username email phone' }
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
          { 'fulfillments.farmer': userId }
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
    
    console.log('GetContractById request:', {
      userId,
      userRole,
      contractId: req.params.contractId
    });

    const contract = await OpenContract.findById(req.params.contractId)
      .populate('buyer', 'username email phone')
      .populate('fulfillments.farmer', 'username email phone');

    if (!contract) {
      console.log('Contract not found:', req.params.contractId);
      return res.status(404).json({ error: 'Contract not found' });
    }

    console.log('Contract found:', {
      contractId: contract._id,
      buyerId: contract.buyer._id.toString(),
      status: contract.status,
      fulfillments: contract.fulfillments.map(f => ({
        farmerId: f.farmer._id.toString(),
        status: f.status
      }))
    });

    // Check if user has permission to view this contract
    const isOwner = contract.buyer._id.toString() === userId;
    const isOpenContract = contract.status === 'open';
    const hasFulfillment = contract.fulfillments?.some(f => 
      f.farmer._id.toString() === userId
    );

    const canView = 
      (userRole === 'buyer' && isOwner) || // Buyer who created the contract
      (userRole === 'farmer' && (isOpenContract || hasFulfillment)); // Farmer with valid access

    console.log('Permission check:', {
      userRole,
      userId,
      isOwner,
      isOpenContract,
      hasFulfillment,
      canView
    });

    if (!canView) {
      return res.status(403).json({ 
        error: 'You do not have permission to view this contract',
        details: {
          userRole,
          isOwner,
          isOpenContract,
          hasFulfillment
        }
      });
    }

    res.json(contract);
  } catch (error) {
    console.error('Error in getContractById:', error);
    res.status(500).json({ error: 'Error fetching contract details', details: error.message });
  }
};

// Create payment intent for contract
exports.createContractPaymentIntent = async (req, res) => {
  try {
    const { contractId, fulfillmentId } = req.body;
    const userId = req.user.id;

    // Get contract and validate
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Verify buyer
    if (contract.buyer.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to make payment for this contract' });
    }

    // Get fulfillment
    const fulfillment = contract.fulfillments.id(fulfillmentId);
    if (!fulfillment || fulfillment.status !== 'accepted') {
      return res.status(400).json({ error: 'Invalid or unaccepted fulfillment' });
    }

    // Calculate total amount including fees
    const amount = fulfillment.price;
    const platformFee = amount * 0.05; // 5% platform fee
    const totalAmount = amount + platformFee + (fulfillment.deliveryFee || 0);

    // Create transaction record
    const transaction = new Transaction({
      sourceType: 'contract',
      sourceId: contractId,
      buyer: userId,
      seller: fulfillment.farmer,
      amount: amount,
      fees: {
        platform: platformFee,
        processing: 0 // Will be updated after Stripe processing
      },
      status: 'pending',
      contractId: contractId,
      fulfillmentId: fulfillmentId
    });
    await transaction.save();

    // Create Stripe payment intent
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        contractId: contractId,
        fulfillmentId: fulfillmentId,
        transactionId: transaction._id.toString()
      }
    });

    // Update transaction with payment intent
    transaction.paymentIntent = {
      stripeId: paymentIntent.id,
      status: paymentIntent.status,
      attempts: [{
        timestamp: new Date(),
        status: paymentIntent.status
      }]
    };
    await transaction.save();

    res.json({
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction._id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
};

// Handle successful payment
exports.handleContractPaymentSuccess = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    // Find transaction by payment intent
    const transaction = await Transaction.findOne({
      'paymentIntent.stripeId': paymentIntentId
    });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction status
    await transaction.updatePaymentStatus('succeeded');
    
    // Update contract payment status
    const contract = await OpenContract.findById(transaction.contractId);
    if (contract) {
      contract.paymentStatus = 'paid';
      await contract.save();
    }

    // Create payout record for farmer
    const payout = new Payout({
      transaction: transaction._id,
      recipient: transaction.seller,
      amount: transaction.calculatePayoutAmount(),
      status: 'pending'
    });
    await payout.save();

    // Send notifications
    await createNotification(
      transaction.seller,
      `Payment received for contract ${contract.productType}`,
      'payment_received'
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error handling payment success:', error);
    res.status(500).json({ error: 'Failed to process payment success' });
  }
};

// Handle payment failure
exports.handleContractPaymentFailure = async (req, res) => {
  try {
    const { paymentIntentId, error } = req.body;

    // Find and update transaction
    const transaction = await Transaction.findOne({
      'paymentIntent.stripeId': paymentIntentId
    });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction status with error
    await transaction.updatePaymentStatus('failed', error);

    // Notify buyer of failure
    await createNotification(
      transaction.buyer,
      `Payment failed for contract. Please try again.`,
      'payment_failed'
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({ error: 'Failed to process payment failure' });
  }
};
