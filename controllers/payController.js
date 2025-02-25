const asyncHandler = require('express-async-handler');
const stripe = require('../config/stripeconfig');
const Auctions = require('../models/Auctions');
const Payout = require('../models/Payout');

const createPaymentIntent = asyncHandler(async (req, res) => {
    try {
        const { amount, currency = 'usd' } = req.body;

        // Create a PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Stripe expects amount in cents
            currency,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        res.status(200).json({
            clientSecret: paymentIntent.client_secret,
        });
    } catch (error) {
        res.status(400).json({
            message: error.message,
        });
    }
});

// Handle Stripe webhook events
const handleWebhook = asyncHandler(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
  
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
  
        // Find the auction associated with this payment
        const auction = await Auctions.findOne({ paymentIntentId: paymentIntent.id });
        if (auction) {
          auction.status = 'paid'; // Mark auction as paid
          await auction.save();
  
          // Additional business logic here, like notifying the seller
        }
        break;
  
      case 'payment_intent.payment_failed':
        // Handle failed payment
        break;
  
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  
    res.json({ received: true });
});
  

// Retrieve payment details
const getPaymentDetails = asyncHandler(async (req, res) => {
    const { paymentIntentId } = req.params;
    
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        res.json(paymentIntent);
    } catch (error) {
        res.status(404).json({
            message: 'Payment not found',
        });
    }
});

const createConnectedAccount = asyncHandler(async (req, res) => {
    try {
        const { email } = req.body; // Capture seller email or other identification details
        
        // Create a connected account for the seller
        const account = await stripe.accounts.create({
            type: 'express',
            country: 'US',
            email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });
        
        res.status(200).json({
            accountId: account.id,
            message: 'Connected account created successfully!',
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

const addBankAccount = asyncHandler(async (req, res) => {
    try {
        const { accountId, bankAccountDetails } = req.body;

        const bankAccount = await stripe.accounts.createExternalAccount(
            accountId,
            {
                external_account: {
                    object: 'bank_account',
                    country: 'US',
                    currency: 'usd',
                    account_number: bankAccountDetails.accountNumber,
                    routing_number: bankAccountDetails.routingNumber,
                    account_holder_name: bankAccountDetails.holderName,
                    account_holder_type: 'individual' // or 'company' depending on the account
                }
            }
        );

        res.status(200).json({
            bankAccountId: bankAccount.id,
            message: 'Bank account added successfully!',
        });
    } catch (error) {
        res.status(400).json({
            message: error.message,
        });
    }
});

const createPayout = asyncHandler(async (req, res) => {
    try {
        const { amount, currency = 'usd', accountId } = req.body;

        // Create a payout from the connected account to the linked bank account
        const payout = await stripe.payouts.create(
            {
                amount: amount * 100, // Amount in cents
                currency,
            },
            {
                stripeAccount: accountId,
            }
        );

        res.status(200).json({
            payoutId: payout.id,
            message: 'Payout created successfully!',
        });
    } catch (error) {
        res.status(400).json({
            message: error.message,
        });
    }
});

const createPayoutForAuction = asyncHandler(async (req, res) => {
    const { auctionId } = req.body;

    try {
        const auction = await Auctions.findById(auctionId).populate('product');

        if (!auction || auction.status !== 'paid') {
            return res.status(400).json({ message: 'Auction not found or not eligible for payout' });
        }

        const farmer = auction.product.user;

        // Create a payout using Stripe
        const payout = await stripe.payouts.create(
            {
                amount: auction.winningBid.amount * 100, // Amount in cents
                currency: 'usd'
            },
            {
                stripeAccount: farmer.stripeAccountId
            }
        );

        // Record the payout in the Payout model
        const newPayout = new Payout({
            userId: farmer._id,
            amount: auction.winningBid.amount,
            date: new Date(),
            stripePayoutId: payout.id
        });

        await newPayout.save();

        res.status(200).json({ message: 'Payout created successfully!', payout: newPayout });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const getSellerBalance = asyncHandler(async (req, res) => {
    // Look up the seller using the authenticated user's ID
    const seller = await User.findById(req.user.id);
    if (!seller || !seller.stripeAccountId) {
      return res.status(400).json({ message: 'Seller not set up for payments' });
    }
  
    // Retrieve the connected account's balance from Stripe
    const balance = await stripe.balance.retrieve({
      stripeAccount: seller.stripeAccountId,
    });
  
    res.status(200).json(balance);
  });
  
  // Retrieve the seller's payout history from Stripe
  const getSellerTransfers = asyncHandler(async (req, res) => {
    // Look up the seller using the authenticated user's ID
    const seller = await User.findById(req.user.id);
    if (!seller || !seller.stripeAccountId) {
      return res.status(400).json({ message: 'Seller not set up for payments' });
    }
  
    // List payouts (transfers) for the connected account
    const payouts = await stripe.payouts.list(
      { limit: 100 },
      { stripeAccount: seller.stripeAccountId }
    );
  
    res.status(200).json(payouts.data);
  });

module.exports = {
    addBankAccount,
    createPayout,
    createConnectedAccount,
    createPaymentIntent,
    handleWebhook,
    getPaymentDetails,
    createPayoutForAuction,
    getSellerBalance,
    getSellerTransfers
};
