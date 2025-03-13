const cron = require('node-cron');
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const { NotificationModel } = require('../models/Notification');
const mongoose = require('mongoose');
const recurringPaymentService = require('../services/recurringPaymentService');

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
          `New recurring contract instance available for ${contract.productType}. Quantity: ${contract.quantity}, Max Price: $${contract.maxPrice}`,
          'contract'
        );

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

// Function to create a new contract instance for a recurring contract
async function createNextContractInstance(contract) {
  try {
    // Calculate the start and end times for the new instance
    const startTime = new Date(contract.nextDeliveryDate);
    
    // Create a new contract with the same details
    const newContract = new OpenContract({
      buyer: contract.buyer,
      productType: contract.productType,
      productCategory: contract.productCategory,
      quantity: contract.quantity,
      maxPrice: contract.maxPrice,
      endTime: startTime,
      deliveryMethod: contract.deliveryMethod,
      deliveryAddress: contract.deliveryAddress,
      status: 'open',
      notifiedFarmers: [],
      paymentStatus: 'pending',
      // Set parent contract reference
      parentContract: contract._id,
      // Copy recurring payment settings from parent
      recurringPaymentSettings: contract.recurringPaymentSettings
    });

    await newContract.save();

    // Update the parent contract's recurring instances
    const instanceNumber = (contract.recurringInstances?.length || 0) + 1;
    contract.recurringInstances.push({
      instanceNumber,
      startDate: startTime,
      endDate: contract.nextDeliveryDate,
      status: 'active',
      fulfillmentId: newContract._id
    });

    // Calculate the next delivery date
    const nextDeliveryDate = new Date(contract.nextDeliveryDate);
    
    switch (contract.recurringFrequency) {
      case 'weekly':
        nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 7);
        break;
      case 'biweekly':
        nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 14);
        break;
      case 'monthly':
        nextDeliveryDate.setMonth(nextDeliveryDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextDeliveryDate.setMonth(nextDeliveryDate.getMonth() + 3);
        break;
    }

    // Update the parent contract with the new next delivery date
    contract.nextDeliveryDate = nextDeliveryDate;
    await contract.save();

    // Notify farmers about the new contract
    await notifyRelevantFarmers(newContract);

    // Notify the buyer
    await createNotification(
      contract.buyer,
      `A new instance of your recurring contract for ${contract.quantity} units of ${contract.productType} has been created.`,
      'contract'
    );

    return newContract;
  } catch (error) {
    console.error('Error creating next contract instance:', error);
    return null;
  }
}

// Function to process automatic payments for fulfilled recurring contracts
async function processAutomaticPayments() {
  try {
    console.log('Processing automatic payments for recurring contracts...');
    
    // Find all contracts that are recurring instances with accepted fulfillments
    const contracts = await OpenContract.find({
      parentContract: { $exists: true, $ne: null },
      status: 'fulfilled',
      paymentStatus: 'pending',
      'winningFulfillment.farmer': { $exists: true }
    }).populate('buyer');

    console.log(`Found ${contracts.length} recurring contracts ready for automatic payment`);

    for (const contract of contracts) {
      try {
        // Check if auto-pay is enabled for this contract or user
        const buyer = contract.buyer;
        const isAutoPayEnabled = 
          contract.recurringPaymentSettings?.autoPayEnabled || 
          buyer.recurringPaymentSettings?.autoPayEnabled;

        if (!isAutoPayEnabled) {
          console.log(`Auto-pay not enabled for contract ${contract._id}`);
          continue;
        }

        // Get the winning fulfillment
        const fulfillment = contract.fulfillments.find(f => 
          f.farmer.toString() === contract.winningFulfillment.farmer.toString() &&
          f.status === 'accepted'
        );

        if (!fulfillment) {
          console.log(`No accepted fulfillment found for contract ${contract._id}`);
          continue;
        }

        // Process the automatic payment
        console.log(`Processing automatic payment for contract ${contract._id}`);
        const transaction = await recurringPaymentService.processAutomaticPayment(contract, fulfillment);
        
        console.log(`Automatic payment processed successfully for contract ${contract._id}`);
      } catch (error) {
        console.error(`Error processing automatic payment for contract ${contract._id}:`, error);
        
        // Create notification for buyer about failed payment
        await createNotification(
          contract.buyer._id,
          `Automatic payment failed for contract: ${contract.productType}. Please update your payment method.`,
          'payment_failed'
        );
      }
    }

    console.log('Automatic payment processing completed');
  } catch (error) {
    console.error('Error processing automatic payments:', error);
  }
}

// Function to send payment reminders for upcoming recurring contracts
async function sendPaymentReminders() {
  try {
    console.log('Sending payment reminders for upcoming recurring contracts...');
    await recurringPaymentService.sendPaymentReminders();
    console.log('Payment reminders sent successfully');
  } catch (error) {
    console.error('Error sending payment reminders:', error);
  }
}

// Function to process recurring contracts
async function processRecurringContracts() {
  try {
    console.log('Processing recurring contracts...');
    
    // Find all active recurring contracts that need to be processed
    const today = new Date();
    const contracts = await OpenContract.find({
      isRecurring: true,
      recurringEndDate: { $gt: today },
      nextDeliveryDate: { $lte: today }
    });

    console.log(`Found ${contracts.length} recurring contracts to process`);

    for (const contract of contracts) {
      // Create the next instance of the contract
      const newContract = await createNextContractInstance(contract);
      
      if (newContract) {
        console.log(`Created new contract instance for recurring contract ${contract._id}`);
      }
    }

    console.log('Recurring contract processing completed');
    
    // Process automatic payments for fulfilled recurring contracts
    await processAutomaticPayments();
    
    // Send payment reminders for upcoming contracts
    await sendPaymentReminders();
  } catch (error) {
    console.error('Error processing recurring contracts:', error);
  }
}

// Schedule the job to run daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running recurring contract job...');
  
  // Ensure database connection
  if (mongoose.connection.readyState !== 1) {
    console.log('Database not connected. Skipping recurring contract job.');
    return;
  }
  
  await processRecurringContracts();
});

// Export the function for testing purposes
module.exports = {
  processRecurringContracts,
  processAutomaticPayments,
  sendPaymentReminders
}; 