// controllers/openContractControllers.js
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const {NotificationModel} = require('../models/Notification');
const twilio = require('twilio');
const Transaction = require('../models/Transaction');
const Payout = require('../models/Payout');
const { NOTIFICATION_TYPES } = require('../constants/notificationTypes');
const notificationService = require('../services/notificationService');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = twilio(accountSid, authToken);

// Helper function to create notifications
async function createNotification(userId, message, type, metadata = {}, req = null) {
  try {
    console.log(`Creating contract notification for user ${userId} of type ${type}`);
    
    // Prepare notification data
    const notificationData = {
      user: userId,
      title: type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
      message,
      type,
      category: type.split('_')[0].toUpperCase(),
      metadata,
      priority: type === NOTIFICATION_TYPES.CONTRACT_FULFILLMENT_OFFER ? 'high' : 'medium'
    };

    // Add reference if provided
    if (metadata.referenceId) {
      notificationData.reference = {
        model: 'OpenContract',
        id: metadata.referenceId
      };
    }

    // Add action if it's a contract notification
    if (type.startsWith('contract_') && metadata.referenceId) {
      notificationData.action = {
        type: 'link',
        text: 'View Contract',
        url: `/contracts/${metadata.referenceId}`
      };
    }

    // First, create the notification in the database
    const notification = await NotificationModel.create(notificationData);
    
    if (!notification) {
      throw new Error('Failed to create notification in database');
    }
    
    console.log(`Notification created with ID: ${notification._id}`);
    
    // Get the socket.io instance
    let io;
    if (req && req.app) {
      io = req.app.get('io');
      console.log('Using request-specific io instance');
    } else {
      io = global.io;
      console.log('Using global io instance');
    }
    
    // Emit the notification via socket.io
    if (io) {
      console.log(`Emitting notification to user_${userId}`);
      // Emit both event types to ensure compatibility with all frontend components
      io.to(`user_${userId}`).emit('notificationUpdate', notification);
      io.to(`user_${userId}`).emit('notification', notification);
    } else {
      console.warn('No socket.io instance available, notification will not be delivered in real-time');
    }
    
    // Also use the notification service for additional delivery channels (email, SMS)
    await notificationService.deliverNotification(notification, io);
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// Helper function to notify farmers about new contracts
async function notifyRelevantFarmers(contract, req = null) {
  try {
    // Find farmers who have products matching the contract requirements
    const relevantFarmers = await User.find({
      role: 'farmer',
      'products.name': contract.productType,
    });

    console.log(`Found ${relevantFarmers.length} relevant farmers for contract ${contract._id}`);
    
    const notifications = [];
    for (const farmer of relevantFarmers) {
      if (!contract.notifiedFarmers.includes(farmer._id)) {
        // Create in-app notification
        const notification = await createNotification(
          farmer._id,
          `New contract available for ${contract.productType}. Quantity: ${contract.quantity}, Max Price: $${contract.maxPrice}`,
          NOTIFICATION_TYPES.CONTRACT_CREATED,
          {
            referenceId: contract._id,
            productType: contract.productType,
            quantity: contract.quantity,
            maxPrice: contract.maxPrice
          },
          req
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

    // Get buyer information including location
    const buyer = await User.findById(req.user.id);
    if (!buyer) {
      return res.status(404).json({ error: 'Buyer not found' });
    }

    // Create contract object
    const contractData = {
      buyer: req.user.id,
      buyerLocation: {
        coordinates: buyer.address.coordinates,
        address: {
          street: buyer.address.street,
          city: buyer.address.city,
          state: buyer.address.state,
          zipCode: buyer.address.zipCode
        }
      },
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
    await notifyRelevantFarmers(contract, req);

    // Create notification for buyer
    await createNotification(
      req.user.id,
      `Your contract for ${quantity} units of ${productType} has been created successfully.`,
      NOTIFICATION_TYPES.CONTRACT_CREATED,
      {
        referenceId: contract._id
      },
      req
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
    }).populate('buyer', 'username email address');
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

    // Get farmer details including location
    const farmer = await User.findById(farmerId);
    if (!farmer) {
      return res.status(404).json({ error: 'Farmer not found' });
    }

    // Add fulfillment
    contract.fulfillments.push({
      farmer: farmerId,
      farmerLocation: {
        coordinates: farmer.address.coordinates,
        address: {
          street: farmer.address.street,
          city: farmer.address.city,
          state: farmer.address.state,
          zipCode: farmer.address.zipCode
        }
      },
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
      `${farmer ? farmer.username : 'A farmer'} has offered to fulfill your contract for ${contract.quantity} units of ${contract.productType} at $${price} per unit.`,
      NOTIFICATION_TYPES.CONTRACT_FULFILLMENT_OFFER,
      {
        referenceId: contract._id,
        fulfillmentId: contract.fulfillments[contract.fulfillments.length - 1]._id,
        contractTitle: `${contract.quantity} units of ${contract.productType}`,
        farmerName: farmer ? farmer.username : 'A farmer',
        price: price,
        productType: contract.productType
      },
      req
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
      farmerLocation: fulfillment.farmerLocation,
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
        NOTIFICATION_TYPES.CONTRACT_ACCEPTED,
        {
          referenceId: contract._id,
          fulfillmentId: fulfillmentId
        },
        req
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
    console.error('Error accepting fulfillment:', error);
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
      NOTIFICATION_TYPES.CONTRACT_COMPLETED,
      {
        referenceId: contract._id
      },
      req
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
      { path: 'buyer', select: 'username email phone address' },
      { path: 'fulfillments.farmer', select: 'username email phone address' }
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
      .populate('buyer', 'username email phone address')
      .populate('fulfillments.farmer', 'username email phone address');

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
      NOTIFICATION_TYPES.PAYMENT_SUCCESSFUL,
      {
        referenceId: transaction._id
      }
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
      NOTIFICATION_TYPES.PAYMENT_FAILED,
      {
        referenceId: transaction._id,
        error: error
      }
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({ error: 'Failed to process payment failure' });
  }
};

// Send notifications for contracts expiring soon
exports.notifyExpiringContracts = async (req, res) => {
  try {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Find contracts expiring in the next 24 hours
    const expiringContracts = await OpenContract.find({
      status: 'open',
      endTime: { $gt: now, $lt: in24Hours }
    });
    
    console.log(`Found ${expiringContracts.length} contracts expiring in the next 24 hours`);
    let notificationCount = 0;
    
    for (const contract of expiringContracts) {
      // Calculate hours remaining
      const hoursRemaining = Math.round((contract.endTime - now) / (60 * 60 * 1000));
      
      // Send notification to the buyer
      await createNotification(
        contract.buyer,
        `Your contract for ${contract.productType} will expire in ${hoursRemaining} hours.`,
        NOTIFICATION_TYPES.CONTRACT_EXPIRING,
        {
          referenceId: contract._id,
          hoursRemaining
        },
        req
      );
      
      notificationCount++;
    }
  
    res.json({ 
      success: true, 
      message: `Sent ${notificationCount} expiration notifications` 
    });
  } catch (error) {
    console.error('Error sending expiration notifications:', error);
    res.status(500).json({ error: 'Failed to send expiration notifications' });
  }
};

// Send notifications for upcoming recurring contract deliveries
exports.notifyRecurringContracts = async (req, res) => {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    // Find recurring contracts with next delivery in 3 days
    const upcomingDeliveries = await OpenContract.find({
      isRecurring: true,
      status: { $in: ['open', 'fulfilled'] },
      nextDeliveryDate: { $gt: now, $lt: in3Days }
    });
    
    console.log(`Found ${upcomingDeliveries.length} recurring contracts with upcoming deliveries`);
    let notificationCount = 0;
    
    for (const contract of upcomingDeliveries) {
      // Calculate days remaining
      const daysUntilDelivery = Math.round((contract.nextDeliveryDate - now) / (24 * 60 * 60 * 1000));
      
      // Send notification to the buyer
      await createNotification(
        contract.buyer,
        `Your recurring contract for ${contract.productType} has a scheduled delivery in ${daysUntilDelivery} days.`,
        NOTIFICATION_TYPES.CONTRACT_RECURRING_REMINDER,
        {
          referenceId: contract._id,
          daysUntilDelivery
        },
        req
      );
      
      // If contract is fulfilled, also notify the farmer
      if (contract.status === 'fulfilled' && contract.winningFulfillment?.farmer) {
        await createNotification(
          contract.winningFulfillment.farmer,
          `Reminder: You have a scheduled delivery for ${contract.productType} in ${daysUntilDelivery} days.`,
          NOTIFICATION_TYPES.CONTRACT_RECURRING_REMINDER,
          {
            referenceId: contract._id,
            daysUntilDelivery
          },
          req
        );
      }
      
      notificationCount++;
    }
    
    res.json({ 
      success: true, 
      message: `Sent ${notificationCount} recurring contract notifications` 
    });
  } catch (error) {
    console.error('Error sending recurring contract notifications:', error);
    res.status(500).json({ error: 'Failed to send recurring contract notifications' });
  }
};

// Test notification for contract fulfillment offer
exports.testFulfillmentNotification = async (req, res) => {
  try {
    const { contractId } = req.params;
    
    const contract = await OpenContract.findById(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    // Get farmer details
    const farmer = await User.findById(req.user.id);
    const testPrice = 100;
    
    // Send test notification to buyer
    await createNotification(
      contract.buyer,
      `TEST: ${farmer ? farmer.username : 'Test Farmer'} has offered to fulfill your contract for ${contract.quantity} units of ${contract.productType} at $${testPrice} per unit.`,
      NOTIFICATION_TYPES.CONTRACT_FULFILLMENT_OFFER,
      {
        referenceId: contract._id,
        fulfillmentId: contract.fulfillments.length > 0 ? contract.fulfillments[0]._id : null,
        contractTitle: `${contract.quantity} units of ${contract.productType}`,
        farmerName: farmer ? farmer.username : 'Test Farmer',
        price: testPrice,
        productType: contract.productType
      },
      req
    );
    
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
};

// Debug notification system
exports.debugNotificationSystem = async (req, res) => {
  try {
    // Check if io is available
    const ioStatus = {
      globalIoAvailable: !!global.io,
      reqAppIoAvailable: !!(req.app && req.app.get('io'))
    };
    
    // Check if the user exists
    const user = await User.findById(req.user.id);
    const userStatus = {
      userFound: !!user,
      email: user ? user.email : null,
      phone: user ? user.phone : null,
      notificationPreferences: user ? user.notificationPreferences : null
    };
    
    // Check recent notifications
    const recentNotifications = await NotificationModel.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    // Send a test notification
    const testNotification = await createNotification(
      req.user.id,
      `This is a debug test notification sent at ${new Date().toLocaleTimeString()}`,
      NOTIFICATION_TYPES.SYSTEM_MAINTENANCE,
      {
        isDebugTest: true,
        timestamp: new Date().toISOString()
      },
      req
    );
    
    res.json({
      ioStatus,
      userStatus,
      recentNotifications,
      testNotification,
      message: 'Debug information collected and test notification sent'
    });
  } catch (error) {
    console.error('Error in debugNotificationSystem:', error);
    res.status(500).json({ error: 'Failed to debug notification system', details: error.message });
  }
};
