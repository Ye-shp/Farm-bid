const asyncHandler = require('express-async-handler');
const stripe = require('../config/stripeconfig');
const Auctions = require('../models/Auction');
const Payout = require('../models/Payout');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// This one is only for auctions
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
      const { email } = req.body;
      
      // Retrieve the authenticated seller using req.user._id for consistency
      const seller = await User.findById(req.user._id);
      if (!seller) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // If a connected account already exists, return it
      if (seller.stripeAccountId) {
        return res.status(200).json({
          accountId: seller.stripeAccountId,
          message: 'Connected account already exists',
        });
      }
      
      // Create a new connected account using the provided email (or the seller's email)
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email || seller.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      // Save the connected account ID to the seller's record
      seller.stripeAccountId = account.id;
      await seller.save();
      
      res.status(200).json({
        accountId: account.id,
        message: 'Connected account created and saved successfully!',
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

const addBankAccount = asyncHandler(async (req, res) => {
    try {
        const { accountId, bankAccountDetails } = req.body;

        // Verify that this connected account belongs to the authenticated user
        const user = await User.findById(req.user._id);
        if (!user || user.stripeAccountId !== accountId) {
            return res.status(403).json({
                message: 'Not authorized to add bank account to this Stripe account'
            });
        }

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
                    account_holder_type: 'individual' 
                }
            }
        );

        res.status(200).json({
            bankAccountId: bankAccount.id,
            message: 'Bank account added successfully!',
        });
    } catch (error) {
        // Provide more detailed error message
        const message = error.type === 'StripeInvalidRequestError' 
            ? 'Invalid bank account details'
            : error.message;
            
        res.status(400).json({
            message: message,
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
  try {
    // Look up the seller using the authenticated user's ID
    const seller = await User.findById(req.user.id);
    
    // If no seller or no Stripe account, return early with redirect
    if (!seller || !seller.stripeAccountId) {
      return res.status(200).json({ 
        redirect: '/create-connected-account',
        message: 'Connected account required'
      });
    }
  
    // Get the balance from Stripe
    const balance = await stripe.balance.retrieve({
      stripeAccount: seller.stripeAccountId,
    });

    // Get external accounts (bank accounts)
    const accounts = await stripe.accounts.retrieve(seller.stripeAccountId);
    
    // Return combined data
    res.status(200).json({
      ...balance,
      external_accounts: accounts.external_accounts,
      stripeAccountId: seller.stripeAccountId
    });
  } catch (error) {
    res.status(400).json({ 
      error: error.message,
      redirect: '/create-connected-account'
    });
  }
});
  
// Retrieve the seller's payout history from Stripe
const getSellerTransfers = asyncHandler(async (req, res) => {
  // Look up the seller using the authenticated user's ID
  const seller = await User.findById(req.user.id);
  if (!seller || !seller.stripeAccountId) {
    return res.status(200).json({ redirect: '/create-connected-account', message: 'Seller transfers message ' });
  }

  // List payouts (transfers) for the connected account
  const payouts = await stripe.payouts.list(
    { limit: 100 },
    { stripeAccount: seller.stripeAccountId }
  );

  res.status(200).json(payouts.data);
});

const requestPayout = asyncHandler(async (req, res) => {
    try {
        const { transactionId } = req.body;

        // Get the authenticated user
        const user = await User.findById(req.user._id);
        if (!user || !user.stripeAccountId) {
            return res.status(400).json({
                message: 'No connected account found for this user'
            });
        }

        // Find the transaction and verify ownership
        const transaction = await Transaction.findById(transactionId)
            .populate('buyer')
            .populate('seller');

        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }

        if (transaction.seller.toString() !== user._id.toString()) {
            return res.status(403).json({
                message: 'Not authorized to request payout for this transaction'
            });
        }

        if (transaction.payoutStatus === 'completed') {
            return res.status(400).json({
                message: 'Payout has already been processed for this transaction'
            });
        }

        // Calculate payout amount (considering platform fees)
        const platformFee = transaction.amount * 0.05; // 5% platform fee
        const payoutAmount = transaction.amount - platformFee;

        // Create an instant payout to the default bank account
        const payout = await stripe.payouts.create({
            amount: Math.round(payoutAmount * 100), // Convert to cents
            currency: 'usd',
            method: 'instant', // Use instant payout if available
            metadata: {
                transactionId: transaction._id.toString()
            }
        }, {
            stripeAccount: user.stripeAccountId,
        });

        // Record the payout in our database
        const newPayout = new Payout({
            userId: user._id,
            transaction: transaction._id,
            amount: payoutAmount,
            stripePayoutId: payout.id,
            status: payout.status,
            metadata: {
                platformFee: platformFee.toString(),
                originalAmount: transaction.amount.toString()
            }
        });
        await newPayout.save();

        // Update transaction status
        transaction.payoutStatus = 'completed';
        transaction.payout = newPayout._id;
        await transaction.save();

        res.status(200).json({
            success: true,
            payout: {
                id: payout.id,
                amount: payoutAmount,
                status: payout.status,
                expectedArrival: payout.arrival_date,
                transaction: transaction._id
            }
        });

    } catch (error) {
        console.error('Payout error:', error);
        res.status(400).json({
            message: error.type === 'StripeInvalidRequestError' 
                ? 'Unable to process payout. Please verify bank account details.'
                : error.message
        });
    }
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
    getSellerTransfers,
    requestPayout
};
