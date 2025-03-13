const recurringPaymentService = require('../services/recurringPaymentService');
const OpenContract = require('../models/OpenContract');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const RecurringPaymentSettings = require('../models/RecurringPaymentSettings');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Get all payment methods for the authenticated user
 */
exports.getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ user: req.user._id });
    res.json(paymentMethods);
  } catch (err) {
    console.error('Error fetching payment methods:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
};

/**
 * Add a new payment method
 */
exports.addPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId, setAsDefault } = req.body;
    
    // Verify the payment method with Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    // Create a new payment method in our database
    const newPaymentMethod = new PaymentMethod({
      user: req.user._id,
      stripePaymentMethodId: paymentMethodId,
      isDefault: setAsDefault,
      card: {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year
      }
    });
    
    // If this is set as default, unset any existing default
    if (setAsDefault) {
      await PaymentMethod.updateMany(
        { user: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    await newPaymentMethod.save();
    
    // Attach the payment method to the customer in Stripe
    const user = await User.findById(req.user._id);
    
    if (!user.stripeCustomerId) {
      // Create a new customer if one doesn't exist
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name
      });
      
      user.stripeCustomerId = customer.id;
      await user.save();
    }
    
    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripeCustomerId
    });
    
    res.json(newPaymentMethod);
  } catch (err) {
    console.error('Error adding payment method:', err);
    res.status(500).json({ error: err.message || 'Failed to add payment method' });
  }
};

/**
 * Remove a payment method
 */
exports.removePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    
    const paymentMethod = await PaymentMethod.findOne({
      _id: paymentMethodId,
      user: req.user._id
    });
    
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Check if this payment method is used in any active recurring contracts
    const contracts = await OpenContract.find({
      $or: [
        { buyer: req.user._id, 'recurringDetails.paymentMethodId': paymentMethod._id },
        { seller: req.user._id, 'recurringDetails.paymentMethodId': paymentMethod._id }
      ],
      status: { $in: ['active', 'pending'] },
      'recurringDetails.isRecurring': true
    });
    
    if (contracts.length > 0) {
      return res.status(400).json({ 
        error: 'This payment method is used in active recurring contracts. Please update those contracts first.' 
      });
    }
    
    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
    
    // Delete from our database
    await paymentMethod.deleteOne();
    
    // If this was the default payment method, update user's settings
    if (paymentMethod.isDefault) {
      const settings = await RecurringPaymentSettings.findOne({ user: req.user._id });
      if (settings) {
        settings.autoPayEnabled = false;
        await settings.save();
      }
    }
    
    res.json({ success: true, message: 'Payment method removed successfully' });
  } catch (err) {
    console.error('Error removing payment method:', err);
    res.status(500).json({ error: err.message || 'Failed to remove payment method' });
  }
};

/**
 * Set a payment method as default
 */
exports.setDefaultPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    
    const paymentMethod = await PaymentMethod.findOne({
      _id: paymentMethodId,
      user: req.user._id
    });
    
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Unset any existing default
    await PaymentMethod.updateMany(
      { user: req.user._id, isDefault: true },
      { $set: { isDefault: false } }
    );
    
    // Set this one as default
    paymentMethod.isDefault = true;
    await paymentMethod.save();
    
    // Update the user's default payment method in Stripe
    const user = await User.findById(req.user._id);
    
    if (user.stripeCustomerId) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.stripePaymentMethodId
        }
      });
    }
    
    // Update recurring payment settings
    let settings = await RecurringPaymentSettings.findOne({ user: req.user._id });
    if (!settings) {
      settings = new RecurringPaymentSettings({
        user: req.user._id,
        autoPayEnabled: true
      });
    }
    
    await settings.save();
    
    res.json(paymentMethod);
  } catch (err) {
    console.error('Error setting default payment method:', err);
    res.status(500).json({ error: err.message || 'Failed to set default payment method' });
  }
};

/**
 * Get recurring payment settings
 */
exports.getRecurringPaymentSettings = async (req, res) => {
  try {
    let settings = await RecurringPaymentSettings.findOne({ user: req.user._id });
    
    if (!settings) {
      // Create default settings if none exist
      settings = new RecurringPaymentSettings({
        user: req.user._id,
        autoPayEnabled: false,
        notificationPreferences: {
          emailNotifications: true,
          smsNotifications: false,
          advanceNoticeDays: 3
        }
      });
      
      await settings.save();
    }
    
    // Get the default payment method if it exists
    const defaultPaymentMethod = await PaymentMethod.findOne({
      user: req.user._id,
      isDefault: true
    });
    
    const result = settings.toObject();
    
    if (defaultPaymentMethod) {
      result.defaultPaymentMethodId = defaultPaymentMethod._id;
      result.defaultPaymentMethod = defaultPaymentMethod;
    }
    
    res.json(result);
  } catch (err) {
    console.error('Error fetching recurring payment settings:', err);
    res.status(500).json({ error: 'Failed to fetch recurring payment settings' });
  }
};

/**
 * Update recurring payment settings
 */
exports.updateRecurringPaymentSettings = async (req, res) => {
  try {
    const { autoPayEnabled, notificationPreferences, defaultPaymentMethodId } = req.body;
    
    let settings = await RecurringPaymentSettings.findOne({ user: req.user._id });
    
    if (!settings) {
      settings = new RecurringPaymentSettings({
        user: req.user._id
      });
    }
    
    // If enabling auto-pay, make sure there's a default payment method
    if (autoPayEnabled) {
      const defaultMethod = await PaymentMethod.findOne({
        user: req.user._id,
        isDefault: true
      });
      
      if (!defaultMethod && !defaultPaymentMethodId) {
        return res.status(400).json({ 
          error: 'You must have a default payment method to enable automatic payments' 
        });
      }
    }
    
    settings.autoPayEnabled = autoPayEnabled;
    
    if (notificationPreferences) {
      settings.notificationPreferences = {
        emailNotifications: notificationPreferences.emailNotifications !== undefined 
          ? notificationPreferences.emailNotifications 
          : settings.notificationPreferences?.emailNotifications || true,
        smsNotifications: notificationPreferences.smsNotifications !== undefined 
          ? notificationPreferences.smsNotifications 
          : settings.notificationPreferences?.smsNotifications || false,
        advanceNoticeDays: notificationPreferences.advanceNoticeDays !== undefined 
          ? notificationPreferences.advanceNoticeDays 
          : settings.notificationPreferences?.advanceNoticeDays || 3
      };
    }
    
    settings.updatedAt = Date.now();
    await settings.save();
    
    // Update default payment method if provided
    if (defaultPaymentMethodId) {
      // Unset any existing default
      await PaymentMethod.updateMany(
        { user: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
      
      // Set the new default
      const paymentMethod = await PaymentMethod.findOne({
        _id: defaultPaymentMethodId,
        user: req.user._id
      });
      
      if (paymentMethod) {
        paymentMethod.isDefault = true;
        await paymentMethod.save();
        
        // Update in Stripe as well
        const user = await User.findById(req.user._id);
        
        if (user.stripeCustomerId) {
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
              default_payment_method: paymentMethod.stripePaymentMethodId
            }
          });
        }
      }
    }
    
    res.json(settings);
  } catch (err) {
    console.error('Error updating recurring payment settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update recurring payment settings' });
  }
};

/**
 * Get contract-specific recurring payment settings
 */
exports.getContractRecurringPaymentSettings = async (req, res) => {
  try {
    const { contractId } = req.params;
    
    const contract = await OpenContract.findById(contractId);
    
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    // Check if user is buyer or seller
    if (
      contract.buyer.toString() !== req.user._id.toString() &&
      contract.seller.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to view this contract' });
    }
    
    // Return the recurring details
    res.json(contract.recurringDetails || {});
  } catch (err) {
    console.error('Error fetching contract recurring settings:', err);
    res.status(500).json({ error: 'Failed to fetch contract recurring settings' });
  }
};

/**
 * Update contract-specific recurring payment settings
 */
exports.updateContractRecurringPaymentSettings = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { autoPayEnabled, paymentMethodId, notifyBeforeCharge, notificationDays } = req.body;
    
    const contract = await OpenContract.findById(contractId);
    
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    // Only the buyer can update payment settings
    if (contract.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the buyer can update payment settings' });
    }
    
    // Make sure the contract is recurring
    if (!contract.recurringDetails || !contract.recurringDetails.isRecurring) {
      return res.status(400).json({ error: 'This is not a recurring contract' });
    }
    
    // If enabling auto-pay, make sure there's a payment method
    if (autoPayEnabled && !paymentMethodId) {
      return res.status(400).json({ 
        error: 'You must specify a payment method to enable automatic payments' 
      });
    }
    
    // Verify payment method belongs to user if provided
    if (paymentMethodId) {
      const paymentMethod = await PaymentMethod.findOne({
        _id: paymentMethodId,
        user: req.user._id
      });
      
      if (!paymentMethod) {
        return res.status(400).json({ error: 'Invalid payment method' });
      }
    }
    
    // Update the contract
    contract.recurringDetails.paymentSettings = {
      autoPayEnabled: autoPayEnabled !== undefined ? autoPayEnabled : contract.recurringDetails.paymentSettings?.autoPayEnabled,
      paymentMethodId: paymentMethodId || contract.recurringDetails.paymentSettings?.paymentMethodId,
      notifyBeforeCharge: notifyBeforeCharge !== undefined ? notifyBeforeCharge : contract.recurringDetails.paymentSettings?.notifyBeforeCharge,
      notificationDays: notificationDays !== undefined ? notificationDays : contract.recurringDetails.paymentSettings?.notificationDays
    };
    
    await contract.save();
    
    res.json(contract.recurringDetails);
  } catch (err) {
    console.error('Error updating contract recurring settings:', err);
    res.status(500).json({ error: err.message || 'Failed to update contract recurring settings' });
  }
}; 