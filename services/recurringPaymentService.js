const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { NotificationModel } = require('../models/Notification');
const twilio = require('twilio');
const PaymentMethod = require('../models/PaymentMethod');
const RecurringPaymentSettings = require('../models/RecurringPaymentSettings');
const notificationService = require('./notificationService');
const moment = require('moment');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = twilio(accountSid, authToken);

/**
 * Create a Stripe customer for a user if they don't already have one
 * @param {Object} user - User object
 * @returns {String} Stripe customer ID
 */
async function ensureStripeCustomer(user) {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Create a new customer in Stripe
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.username,
    phone: user.phone,
    metadata: {
      userId: user._id.toString()
    }
  });

  // Update user with Stripe customer ID
  user.stripeCustomerId = customer.id;
  await user.save();

  return customer.id;
}

/**
 * Save a payment method to a user's Stripe customer
 * @param {String} userId - User ID
 * @param {String} paymentMethodId - Stripe payment method ID
 * @param {Boolean} setAsDefault - Whether to set this as the default payment method
 * @returns {Object} Updated user object
 */
async function savePaymentMethod(userId, paymentMethodId, setAsDefault = false) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Ensure user has a Stripe customer ID
  const customerId = await ensureStripeCustomer(user);

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });

  // Set as default if requested
  if (setAsDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update user's recurring payment settings
    if (!user.recurringPaymentSettings) {
      user.recurringPaymentSettings = {};
    }
    user.recurringPaymentSettings.defaultPaymentMethodId = paymentMethodId;
  }

  // Get payment method details
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

  // Add to user's payment methods
  const newPaymentMethod = {
    type: paymentMethod.type,
    isDefault: setAsDefault,
    stripePaymentMethodId: paymentMethodId,
  };

  // Add card-specific details if it's a card
  if (paymentMethod.type === 'card') {
    newPaymentMethod.last4 = paymentMethod.card.last4;
    newPaymentMethod.brand = paymentMethod.card.brand;
    newPaymentMethod.expiryMonth = paymentMethod.card.exp_month;
    newPaymentMethod.expiryYear = paymentMethod.card.exp_year;
  }

  // Update existing payment methods to remove default flag if setting a new default
  if (setAsDefault) {
    user.paymentMethods.forEach(method => {
      method.isDefault = false;
    });
  }

  user.paymentMethods.push(newPaymentMethod);
  await user.save();

  return user;
}

/**
 * Get a user's saved payment methods
 * @param {String} userId - User ID
 * @returns {Array} Array of payment methods
 */
async function getPaymentMethods(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.stripeCustomerId) {
    return [];
  }

  // Get payment methods from Stripe
  const paymentMethods = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: 'card',
  });

  return paymentMethods.data;
}

/**
 * Update a user's recurring payment settings
 * @param {String} userId - User ID
 * @param {Object} settings - New settings
 * @returns {Object} Updated user object
 */
async function updateRecurringPaymentSettings(userId, settings) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.recurringPaymentSettings) {
    user.recurringPaymentSettings = {};
  }

  // Update settings
  if (settings.autoPayEnabled !== undefined) {
    user.recurringPaymentSettings.autoPayEnabled = settings.autoPayEnabled;
  }

  if (settings.defaultPaymentMethodId) {
    user.recurringPaymentSettings.defaultPaymentMethodId = settings.defaultPaymentMethodId;
    
    // Update payment methods to reflect new default
    user.paymentMethods.forEach(method => {
      method.isDefault = method.stripePaymentMethodId === settings.defaultPaymentMethodId;
    });
  }

  if (settings.notificationPreferences) {
    if (!user.recurringPaymentSettings.notificationPreferences) {
      user.recurringPaymentSettings.notificationPreferences = {};
    }
    
    const { notificationPreferences } = settings;
    
    if (notificationPreferences.emailNotifications !== undefined) {
      user.recurringPaymentSettings.notificationPreferences.emailNotifications = 
        notificationPreferences.emailNotifications;
    }
    
    if (notificationPreferences.smsNotifications !== undefined) {
      user.recurringPaymentSettings.notificationPreferences.smsNotifications = 
        notificationPreferences.smsNotifications;
    }
    
    if (notificationPreferences.advanceNoticeDays !== undefined) {
      user.recurringPaymentSettings.notificationPreferences.advanceNoticeDays = 
        notificationPreferences.advanceNoticeDays;
    }
  }

  await user.save();
  return user;
}

/**
 * Update a contract's recurring payment settings
 * @param {String} contractId - Contract ID
 * @param {Object} settings - New settings
 * @returns {Object} Updated contract object
 */
async function updateContractRecurringPaymentSettings(contractId, settings) {
  const contract = await OpenContract.findById(contractId);
  if (!contract) {
    throw new Error('Contract not found');
  }

  if (!contract.isRecurring) {
    throw new Error('Contract is not recurring');
  }

  if (!contract.recurringPaymentSettings) {
    contract.recurringPaymentSettings = {};
  }

  // Update settings
  if (settings.autoPayEnabled !== undefined) {
    contract.recurringPaymentSettings.autoPayEnabled = settings.autoPayEnabled;
  }

  if (settings.paymentMethodId) {
    contract.recurringPaymentSettings.paymentMethodId = settings.paymentMethodId;
  }

  if (settings.notifyBeforeCharge !== undefined) {
    contract.recurringPaymentSettings.notifyBeforeCharge = settings.notifyBeforeCharge;
  }

  if (settings.notificationDays !== undefined) {
    contract.recurringPaymentSettings.notificationDays = settings.notificationDays;
  }

  await contract.save();
  return contract;
}

/**
 * Process automatic payment for a contract
 * @param {Object} contract - Contract object
 * @param {Object} fulfillment - Fulfillment object
 * @returns {Object} Transaction object
 */
async function processAutomaticPayment(contract, fulfillment) {
  try {
    // Get buyer
    const buyer = await User.findById(contract.buyer);
    if (!buyer) {
      throw new Error('Buyer not found');
    }

    // Check if auto-pay is enabled
    if (!contract.recurringPaymentSettings?.autoPayEnabled && 
        !buyer.recurringPaymentSettings?.autoPayEnabled) {
      throw new Error('Automatic payments not enabled for this contract or user');
    }

    // Get payment method ID (from contract or user default)
    const paymentMethodId = contract.recurringPaymentSettings?.paymentMethodId || 
                           buyer.recurringPaymentSettings?.defaultPaymentMethodId;
    
    if (!paymentMethodId) {
      throw new Error('No payment method found for automatic payment');
    }

    // Calculate amount
    const amount = fulfillment.price;
    const platformFee = amount * 0.05; // 5% platform fee
    const totalAmount = amount + platformFee + (fulfillment.deliveryFee || 0);

    // Create transaction record
    const transaction = new Transaction({
      sourceType: 'contract',
      sourceId: contract._id,
      buyer: contract.buyer,
      seller: fulfillment.farmer,
      amount: amount,
      fees: {
        platform: platformFee,
        processing: 0 // Will be updated after Stripe processing
      },
      status: 'pending',
      contractId: contract._id,
      fulfillmentId: fulfillment._id,
      isRecurring: true,
      parentContractId: contract.parentContract
    });
    await transaction.save();

    // Create payment intent with the specified payment method
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Convert to cents
      currency: 'usd',
      customer: buyer.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true, // Important for recurring payments
      confirm: true, // Confirm the payment immediately
      metadata: {
        contractId: contract._id.toString(),
        fulfillmentId: fulfillment._id.toString(),
        transactionId: transaction._id.toString(),
        isRecurring: 'true',
        parentContractId: contract.parentContract ? contract.parentContract.toString() : ''
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

    // Update contract payment status
    contract.paymentStatus = 'completed';
    await contract.save();

    // Create notification for buyer
    await createNotification(
      contract.buyer,
      `Automatic payment of $${totalAmount.toFixed(2)} processed for recurring contract: ${contract.productType}`,
      'payment_processed'
    );

    // Create notification for seller
    await createNotification(
      fulfillment.farmer,
      `Payment of $${amount.toFixed(2)} received for contract: ${contract.productType}`,
      'payment_received'
    );

    return transaction;
  } catch (error) {
    console.error('Error processing automatic payment:', error);
    
    // Create notification for buyer about failed payment
    await createNotification(
      contract.buyer,
      `Automatic payment failed for contract: ${contract.productType}. Please update your payment method.`,
      'payment_failed'
    );
    
    // Send SMS notification if enabled
    try {
      const buyer = await User.findById(contract.buyer);
      if (buyer && buyer.recurringPaymentSettings?.notificationPreferences?.smsNotifications) {
        await client.messages.create({
          body: `Your automatic payment for ${contract.productType} failed. Please log in to update your payment method.`,
          to: buyer.phone,
          messagingServiceSid,
        });
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
    }
    
    throw error;
  }
}

/**
 * Create a notification
 * @param {String} userId - User ID
 * @param {String} message - Notification message
 * @param {String} type - Notification type
 * @returns {Object} Notification object
 */
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

/**
 * Send payment reminders for upcoming recurring contracts
 */
async function sendPaymentReminders() {
  try {
    const today = new Date();
    
    // Find all users with recurring payment settings
    const users = await User.find({
      'recurringPaymentSettings.autoPayEnabled': true,
      'recurringPaymentSettings.notificationPreferences.emailNotifications': true
    });
    
    for (const user of users) {
      const advanceNoticeDays = user.recurringPaymentSettings.notificationPreferences.advanceNoticeDays || 3;
      
      // Calculate the date range for upcoming payments
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + advanceNoticeDays);
      
      // Find contracts that will be charged soon
      const upcomingContracts = await OpenContract.find({
        buyer: user._id,
        isRecurring: true,
        nextDeliveryDate: {
          $gte: today,
          $lte: reminderDate
        },
        'recurringPaymentSettings.autoPayEnabled': true
      });
      
      if (upcomingContracts.length > 0) {
        // Create notification for upcoming payments
        await createNotification(
          user._id,
          `You have ${upcomingContracts.length} upcoming automatic payments scheduled in the next ${advanceNoticeDays} days.`,
          'payment_reminder'
        );
        
        // Send SMS if enabled
        if (user.recurringPaymentSettings.notificationPreferences.smsNotifications && user.phone) {
          try {
            await client.messages.create({
              body: `You have ${upcomingContracts.length} upcoming automatic payments scheduled in the next ${advanceNoticeDays} days. Log in to view details.`,
              to: user.phone,
              messagingServiceSid,
            });
          } catch (smsError) {
            console.error('SMS reminder failed:', smsError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error sending payment reminders:', error);
  }
}

/**
 * Process automatic payments for recurring contracts that are due
 */
exports.processRecurringPayments = async () => {
  try {
    console.log('Starting recurring payment processing...');
    
    // Find all active recurring contracts that are due for payment
    const today = new Date();
    const contracts = await OpenContract.find({
      'recurringDetails.isRecurring': true,
      'recurringDetails.nextPaymentDate': { $lte: today },
      'recurringDetails.paymentSettings.autoPayEnabled': true,
      status: 'active'
    }).populate('buyer seller');
    
    console.log(`Found ${contracts.length} contracts due for payment`);
    
    for (const contract of contracts) {
      try {
        await processContractPayment(contract);
      } catch (err) {
        console.error(`Error processing payment for contract ${contract._id}:`, err);
        
        // Send notification to buyer about failed payment
        await notificationService.sendNotification({
          recipient: contract.buyer._id,
          type: 'payment_failed',
          title: 'Payment Failed',
          message: `Automatic payment for contract "${contract.title}" failed. Please update your payment method.`,
          data: {
            contractId: contract._id,
            error: err.message
          }
        });
      }
    }
    
    console.log('Recurring payment processing completed');
  } catch (err) {
    console.error('Error in processRecurringPayments:', err);
  }
};

/**
 * Process payment for a single contract
 */
const processContractPayment = async (contract) => {
  // Get payment method
  const paymentMethodId = contract.recurringDetails.paymentSettings.paymentMethodId;
  const paymentMethod = await PaymentMethod.findById(paymentMethodId);
  
  if (!paymentMethod) {
    throw new Error('Payment method not found');
  }
  
  // Calculate amount
  const amount = contract.recurringDetails.amount;
  
  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    payment_method: paymentMethod.stripePaymentMethodId,
    customer: contract.buyer.stripeCustomerId,
    confirm: true,
    off_session: true,
    metadata: {
      contractId: contract._id.toString(),
      buyerId: contract.buyer._id.toString(),
      sellerId: contract.seller._id.toString(),
      paymentType: 'recurring'
    }
  });
  
  // Create transaction record
  const transaction = new Transaction({
    buyer: contract.buyer._id,
    seller: contract.seller._id,
    contract: contract._id,
    amount: amount,
    paymentIntentId: paymentIntent.id,
    status: paymentIntent.status,
    type: 'recurring_payment',
    description: `Recurring payment for ${contract.title}`,
    metadata: {
      paymentMethodId: paymentMethod._id,
      recurringCycle: contract.recurringDetails.currentCycle
    }
  });
  
  await transaction.save();
  
  // Update contract with next payment date and increment cycle
  contract.recurringDetails.currentCycle += 1;
  
  // Calculate next payment date based on frequency
  const nextPaymentDate = calculateNextPaymentDate(
    contract.recurringDetails.frequency,
    contract.recurringDetails.nextPaymentDate
  );
  
  contract.recurringDetails.nextPaymentDate = nextPaymentDate;
  contract.recurringDetails.lastPaymentDate = new Date();
  
  await contract.save();
  
  // Send notification to buyer and seller
  await notificationService.sendNotification({
    recipient: contract.buyer._id,
    type: 'payment_processed',
    title: 'Payment Processed',
    message: `Your recurring payment of $${amount.toFixed(2)} for "${contract.title}" has been processed.`,
    data: {
      contractId: contract._id,
      transactionId: transaction._id,
      amount: amount
    }
  });
  
  await notificationService.sendNotification({
    recipient: contract.seller._id,
    type: 'payment_received',
    title: 'Payment Received',
    message: `You've received a recurring payment of $${amount.toFixed(2)} for "${contract.title}".`,
    data: {
      contractId: contract._id,
      transactionId: transaction._id,
      amount: amount
    }
  });
  
  return { transaction, paymentIntent };
};

/**
 * Calculate the next payment date based on frequency
 */
const calculateNextPaymentDate = (frequency, currentDate) => {
  const date = moment(currentDate);
  
  switch (frequency) {
    case 'weekly':
      return date.add(1, 'weeks').toDate();
    case 'biweekly':
      return date.add(2, 'weeks').toDate();
    case 'monthly':
      return date.add(1, 'months').toDate();
    case 'quarterly':
      return date.add(3, 'months').toDate();
    case 'biannually':
      return date.add(6, 'months').toDate();
    case 'annually':
      return date.add(1, 'years').toDate();
    default:
      return date.add(1, 'months').toDate();
  }
};

/**
 * Send payment reminders for upcoming recurring payments
 */
exports.sendPaymentReminders = async () => {
  try {
    console.log('Starting payment reminder processing...');
    
    // Get all active recurring contracts
    const contracts = await OpenContract.find({
      'recurringDetails.isRecurring': true,
      status: 'active'
    }).populate('buyer seller');
    
    const today = moment();
    
    for (const contract of contracts) {
      try {
        // Skip if auto-pay is enabled and no notification is requested
        if (
          contract.recurringDetails.paymentSettings.autoPayEnabled &&
          !contract.recurringDetails.paymentSettings.notifyBeforeCharge
        ) {
          continue;
        }
        
        const nextPaymentDate = moment(contract.recurringDetails.nextPaymentDate);
        const daysUntilPayment = nextPaymentDate.diff(today, 'days');
        
        // Get notification days preference
        let notificationDays = 3; // Default
        
        if (contract.recurringDetails.paymentSettings.notificationDays) {
          notificationDays = contract.recurringDetails.paymentSettings.notificationDays;
        } else {
          // Check user's global settings
          const settings = await RecurringPaymentSettings.findOne({ user: contract.buyer._id });
          if (settings && settings.notificationPreferences) {
            notificationDays = settings.notificationPreferences.advanceNoticeDays;
          }
        }
        
        // Send reminder if payment is due in exactly the notification days
        if (daysUntilPayment === notificationDays) {
          await notificationService.sendNotification({
            recipient: contract.buyer._id,
            type: 'payment_reminder',
            title: 'Upcoming Payment Reminder',
            message: `Your recurring payment of $${contract.recurringDetails.amount.toFixed(2)} for "${contract.title}" is due in ${notificationDays} days.`,
            data: {
              contractId: contract._id,
              paymentDate: contract.recurringDetails.nextPaymentDate,
              amount: contract.recurringDetails.amount
            }
          });
        }
      } catch (err) {
        console.error(`Error processing reminder for contract ${contract._id}:`, err);
      }
    }
    
    console.log('Payment reminder processing completed');
  } catch (err) {
    console.error('Error in sendPaymentReminders:', err);
  }
};

/**
 * Handle payment method expiration
 */
exports.handleExpiringPaymentMethods = async () => {
  try {
    console.log('Checking for expiring payment methods...');
    
    const today = moment();
    const currentMonth = today.month() + 1; // Moment months are 0-indexed
    const currentYear = today.year();
    
    // Find payment methods expiring this month
    const paymentMethods = await PaymentMethod.find({
      'card.exp_month': currentMonth,
      'card.exp_year': currentYear
    }).populate('user');
    
    for (const method of paymentMethods) {
      try {
        // Send notification to user
        await notificationService.sendNotification({
          recipient: method.user._id,
          type: 'payment_method_expiring',
          title: 'Payment Method Expiring',
          message: `Your payment method (${method.card.brand} ending in ${method.card.last4}) is expiring this month. Please update your payment information.`,
          data: {
            paymentMethodId: method._id
          }
        });
        
        // If this is a default payment method, check for affected contracts
        if (method.isDefault) {
          const contracts = await OpenContract.find({
            'recurringDetails.isRecurring': true,
            'recurringDetails.paymentSettings.autoPayEnabled': true,
            'recurringDetails.paymentSettings.paymentMethodId': method._id,
            status: 'active'
          });
          
          if (contracts.length > 0) {
            await notificationService.sendNotification({
              recipient: method.user._id,
              type: 'payment_method_expiring_contracts',
              title: 'Action Required: Update Payment Method',
              message: `Your expiring payment method is used for ${contracts.length} active recurring contracts. Please update your payment information to avoid service interruption.`,
              data: {
                paymentMethodId: method._id,
                contractCount: contracts.length
              }
            });
          }
        }
      } catch (err) {
        console.error(`Error handling expiring payment method ${method._id}:`, err);
      }
    }
    
    console.log('Expiring payment method check completed');
  } catch (err) {
    console.error('Error in handleExpiringPaymentMethods:', err);
  }
};

/**
 * Handle failed payments and retry logic
 */
exports.handleFailedPayments = async () => {
  try {
    console.log('Processing failed payments...');
    
    // Find failed transactions from the last 7 days
    const sevenDaysAgo = moment().subtract(7, 'days').toDate();
    
    const failedTransactions = await Transaction.find({
      status: 'failed',
      type: 'recurring_payment',
      createdAt: { $gte: sevenDaysAgo },
      'metadata.retryCount': { $lt: 3 } // Limit retries to 3 attempts
    }).populate({
      path: 'contract',
      populate: {
        path: 'buyer seller'
      }
    });
    
    for (const transaction of failedTransactions) {
      try {
        // Skip if contract is no longer active
        if (!transaction.contract || transaction.contract.status !== 'active') {
          continue;
        }
        
        // Increment retry count
        if (!transaction.metadata) transaction.metadata = {};
        if (!transaction.metadata.retryCount) transaction.metadata.retryCount = 0;
        transaction.metadata.retryCount += 1;
        
        // Get payment method
        const paymentMethodId = transaction.contract.recurringDetails.paymentSettings.paymentMethodId;
        const paymentMethod = await PaymentMethod.findById(paymentMethodId);
        
        if (!paymentMethod) {
          transaction.metadata.lastError = 'Payment method not found';
          await transaction.save();
          continue;
        }
        
        // Retry payment
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(transaction.amount * 100), // Convert to cents
          currency: 'usd',
          payment_method: paymentMethod.stripePaymentMethodId,
          customer: transaction.contract.buyer.stripeCustomerId,
          confirm: true,
          off_session: true,
          metadata: {
            contractId: transaction.contract._id.toString(),
            buyerId: transaction.contract.buyer._id.toString(),
            sellerId: transaction.contract.seller._id.toString(),
            paymentType: 'recurring_retry',
            originalTransactionId: transaction._id.toString()
          }
        });
        
        // Create new transaction for the retry
        const retryTransaction = new Transaction({
          buyer: transaction.buyer,
          seller: transaction.seller,
          contract: transaction.contract._id,
          amount: transaction.amount,
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          type: 'recurring_payment_retry',
          description: `Retry payment for ${transaction.contract.title}`,
          metadata: {
            originalTransactionId: transaction._id,
            retryNumber: transaction.metadata.retryCount,
            paymentMethodId: paymentMethod._id
          }
        });
        
        await retryTransaction.save();
        
        // Update original transaction
        transaction.metadata.retryTransactionId = retryTransaction._id;
        transaction.metadata.lastRetryDate = new Date();
        
        if (paymentIntent.status === 'succeeded') {
          transaction.status = 'succeeded';
          transaction.metadata.resolvedBy = 'retry';
          
          // Send notification about successful retry
          await notificationService.sendNotification({
            recipient: transaction.contract.buyer._id,
            type: 'payment_retry_succeeded',
            title: 'Payment Retry Successful',
            message: `Your recurring payment of $${transaction.amount.toFixed(2)} for "${transaction.contract.title}" has been successfully processed after a previous failure.`,
            data: {
              contractId: transaction.contract._id,
              transactionId: retryTransaction._id,
              amount: transaction.amount
            }
          });
        } else {
          // If still failing, notify user
          await notificationService.sendNotification({
            recipient: transaction.contract.buyer._id,
            type: 'payment_retry_failed',
            title: 'Payment Retry Failed',
            message: `We tried to process your recurring payment of $${transaction.amount.toFixed(2)} for "${transaction.contract.title}" again, but it failed. Please update your payment method.`,
            data: {
              contractId: transaction.contract._id,
              transactionId: transaction._id,
              retryCount: transaction.metadata.retryCount
            }
          });
        }
        
        await transaction.save();
      } catch (err) {
        console.error(`Error retrying payment for transaction ${transaction._id}:`, err);
        
        // Update transaction with error
        if (!transaction.metadata) transaction.metadata = {};
        transaction.metadata.lastError = err.message;
        await transaction.save();
      }
    }
    
    console.log('Failed payment processing completed');
  } catch (err) {
    console.error('Error in handleFailedPayments:', err);
  }
};

/**
 * Check for contracts with upcoming renewals and notify users
 */
exports.checkContractRenewals = async () => {
  try {
    console.log('Checking for contract renewals...');
    
    const today = moment();
    const thirtyDaysFromNow = moment().add(30, 'days').toDate();
    
    // Find contracts ending in the next 30 days
    const contracts = await OpenContract.find({
      'recurringDetails.isRecurring': true,
      'recurringDetails.endDate': { $lte: thirtyDaysFromNow, $gt: today.toDate() },
      status: 'active'
    }).populate('buyer seller');
    
    for (const contract of contracts) {
      try {
        const daysUntilEnd = moment(contract.recurringDetails.endDate).diff(today, 'days');
        
        // Notify at 30, 14, 7, and 3 days before expiration
        if ([30, 14, 7, 3].includes(daysUntilEnd)) {
          // Notify buyer
          await notificationService.sendNotification({
            recipient: contract.buyer._id,
            type: 'contract_renewal_reminder',
            title: 'Contract Renewal Reminder',
            message: `Your recurring contract "${contract.title}" will end in ${daysUntilEnd} days. Please review and consider renewal.`,
            data: {
              contractId: contract._id,
              endDate: contract.recurringDetails.endDate,
              daysRemaining: daysUntilEnd
            }
          });
          
          // Notify seller
          await notificationService.sendNotification({
            recipient: contract.seller._id,
            type: 'contract_renewal_reminder',
            title: 'Contract Renewal Reminder',
            message: `Your recurring contract "${contract.title}" with ${contract.buyer.name} will end in ${daysUntilEnd} days.`,
            data: {
              contractId: contract._id,
              endDate: contract.recurringDetails.endDate,
              daysRemaining: daysUntilEnd
            }
          });
        }
      } catch (err) {
        console.error(`Error processing renewal notification for contract ${contract._id}:`, err);
      }
    }
    
    console.log('Contract renewal check completed');
  } catch (err) {
    console.error('Error in checkContractRenewals:', err);
  }
};

module.exports = {
  ensureStripeCustomer,
  savePaymentMethod,
  getPaymentMethods,
  updateRecurringPaymentSettings,
  updateContractRecurringPaymentSettings,
  processAutomaticPayment,
  calculateNextPaymentDate,
  processContractPayment
}; 