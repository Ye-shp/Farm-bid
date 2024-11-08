const asyncHandler = require('express-async-handler');
const stripe = require('../config/stripeconfig');


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
            req.rawBody, // You'll need to configure express to use raw body
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle different event types
    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            // Add your business logic here
            // e.g., update order status, send confirmation email, etc.
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

const createPayout = asyncHandler(async (req, res) => {
    try {
        const { amount, currency = 'usd', accountId } = req.body;

        // Create a payout to the connected account
        const payout = await stripe.transfers.create({
            amount: amount * 100, // Stripe expects amount in cents
            currency,
            destination: accountId,
        });

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




module.exports = {
    createPayout,
    createConnectedAccount,
    createPaymentIntent,
    handleWebhook,
    getPaymentDetails,
};