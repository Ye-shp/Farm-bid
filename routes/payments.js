const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const RecurringPaymentSettings = require('../models/RecurringPaymentSettings');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Get all payment methods for the authenticated user
router.get('/methods', auth, async (req, res) => {
  try {
    const paymentMethods = await PaymentMethod.find({ user: req.user.id });
    res.json(paymentMethods);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Add a new payment method
router.post('/methods', auth, async (req, res) => {
  try {
    const { paymentMethodId, setAsDefault } = req.body;
    
    // Verify the payment method with Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    
    // Create a new payment method in our database
    const newPaymentMethod = new PaymentMethod({
      user: req.user.id,
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
        { user: req.user.id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }
    
    await newPaymentMethod.save();
    
    // Attach the payment method to the customer in Stripe
    const user = await User.findById(req.user.id);
    
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
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a payment method
router.delete('/methods/:id', auth, async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Detach from Stripe
    await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
    
    // Delete from our database
    await paymentMethod.remove();
    
    res.json({ success: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Set a payment method as default
router.put('/methods/:id/default', auth, async (req, res) => {
  try {
    const paymentMethod = await PaymentMethod.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    
    // Unset any existing default
    await PaymentMethod.updateMany(
      { user: req.user.id, isDefault: true },
      { $set: { isDefault: false } }
    );
    
    // Set this one as default
    paymentMethod.isDefault = true;
    await paymentMethod.save();
    
    // Update the user's default payment method in Stripe
    const user = await User.findById(req.user.id);
    
    if (user.stripeCustomerId) {
      await stripe.customers.update(user.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.stripePaymentMethodId
        }
      });
    }
    
    res.json(paymentMethod);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get recurring payment settings
router.get('/recurring-settings', auth, async (req, res) => {
  try {
    let settings = await RecurringPaymentSettings.findOne({ user: req.user.id });
    
    if (!settings) {
      // Create default settings if none exist
      settings = new RecurringPaymentSettings({
        user: req.user.id,
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
      user: req.user.id,
      isDefault: true
    });
    
    if (defaultPaymentMethod) {
      settings = settings.toObject();
      settings.defaultPaymentMethodId = defaultPaymentMethod._id;
    }
    
    res.json(settings);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update recurring payment settings
router.put('/recurring-settings', auth, async (req, res) => {
  try {
    const { autoPayEnabled, notificationPreferences, defaultPaymentMethodId } = req.body;
    
    let settings = await RecurringPaymentSettings.findOne({ user: req.user.id });
    
    if (!settings) {
      settings = new RecurringPaymentSettings({
        user: req.user.id
      });
    }
    
    settings.autoPayEnabled = autoPayEnabled;
    
    if (notificationPreferences) {
      settings.notificationPreferences = {
        emailNotifications: notificationPreferences.emailNotifications || true,
        smsNotifications: notificationPreferences.smsNotifications || false,
        advanceNoticeDays: notificationPreferences.advanceNoticeDays || 3
      };
    }
    
    await settings.save();
    
    // Update default payment method if provided
    if (defaultPaymentMethodId) {
      // Unset any existing default
      await PaymentMethod.updateMany(
        { user: req.user.id, isDefault: true },
        { $set: { isDefault: false } }
      );
      
      // Set the new default
      const paymentMethod = await PaymentMethod.findOne({
        _id: defaultPaymentMethodId,
        user: req.user.id
      });
      
      if (paymentMethod) {
        paymentMethod.isDefault = true;
        await paymentMethod.save();
        
        // Update in Stripe as well
        const user = await User.findById(req.user.id);
        
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
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 