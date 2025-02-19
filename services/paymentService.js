const stripe = require('../config/stripeconfig');
const { Transaction } = require('../models/Transaction');
const { Payout } = require('../models/Payout');
const User = require('../models/User');

const PLATFORM_FEE_PERCENTAGE = 0.05; // 5%
const PROCESSING_FEE_PERCENTAGE = 0.029; // 2.9%
const PROCESSING_FEE_FIXED = 0.30; // $0.30

class PaymentService {
  /**
   * Calculate fees for a given amount
   */
  static calculateFees(amount) {
    return {
      platform: amount * PLATFORM_FEE_PERCENTAGE,
      processing: (amount * PROCESSING_FEE_PERCENTAGE) + PROCESSING_FEE_FIXED
    };
  }

  /**
   * Create a payment intent and transaction record
   */
  static async createPaymentIntent({ amount, sourceType, sourceId, buyerId, sellerId, metadata = {}, options = {} }) {
    try {
      // Calculate fees
      const fees = this.calculateFees(amount);
      
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        ...options,
        metadata: {
          sourceType,
          sourceId,
          buyerId,
          sellerId,
          ...metadata
        }
      });

      // Create transaction record
      const transaction = await Transaction.create({
        sourceType,
        sourceId,
        buyer: buyerId,
        seller: sellerId,
        amount,
        fees,
        delivery:{
          method: metadata.deliveryMethod,
        },
        status: 'pending',
        paymentIntent: {
          stripeId: paymentIntent.id,
          status: paymentIntent.status,
          attempts: [{
            timestamp: new Date(),
            status: paymentIntent.status
          }],
          lastAttempt: new Date()
        },
        metadata: new Map(Object.entries(metadata))
      });

      // Return only what the frontend needs
      return {
        client_secret: paymentIntent.client_secret,
        status: paymentIntent.status,
        id: paymentIntent.id
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Handle auction end by creating payment intent
   */
  static async handleAuctionEnd(auction) {
    if (!auction.bids || auction.bids.length === 0) {
      return null;
    }

    const winningBid = auction.bids[auction.bids.length - 1];
    
    try {
      const paymentData = await this.createPaymentIntent({
        amount: winningBid.amount,
        sourceType: 'auction',
        sourceId: auction._id,
        buyerId: winningBid.user,
        sellerId: auction.product.user,
        metadata: {
          productId: auction.product._id.toString(),
          productTitle: auction.product.title,
          bidId: winningBid._id.toString()
        }
      });

      // Ensure we return all necessary fields
      return {
        client_secret: paymentData.client_secret,
        status: paymentData.status,
        id: paymentData.id,
        amount: winningBid.amount,
        fees: paymentData.fees
      };
    } catch (error) {
      console.error('Error handling auction end payment:', error);
      throw error;
    }
  }

  /**
   * Process payout to seller
   */
  static async processPayout(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate('seller', 'stripeAccountId');

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'payment_held') {
        throw new Error('Transaction not ready for payout');
      }

      const seller = transaction.seller;
      if (!seller.stripeAccountId) {
        throw new Error('Seller not setup for payouts');
      }

      const payoutAmount = transaction.calculatePayoutAmount();

      const transfer = await stripe.transfers.create({
        amount: Math.round(payoutAmount * 100),
        currency: 'usd',
        destination: seller.stripeAccountId,
        description: `Payout for ${transaction.sourceType} ${transaction.sourceId}`,
        metadata: {
          transactionId: transaction._id.toString(),
          sourceType: transaction.sourceType,
          sourceId: transaction.sourceId.toString()
        }
      });

      // Update transaction with payout details
      transaction.payout = {
        stripeId: transfer.id,
        status: transfer.status,
        amount: payoutAmount,
        processedAt: new Date()
      };
      transaction.status = 'completed';
      await transaction.save();

      // Create payout record
      const payout = await Payout.create({
        userId: seller._id,
        amount: payoutAmount,
        date: new Date(),
        stripePayoutId: transfer.id,
        transaction: transaction._id
      });

      return { transfer, payout, transaction };
    } catch (error) {
      console.error('Error processing payout:', error);
      throw error;
    }
  }

  /**
   * Handle webhook events
   */
  static async handleWebhookEvent(event) {
    const { type, data } = event;

    switch (type) {
      case 'payment_intent.succeeded':
        return await this.handleSuccessfulPayment(data.object);
      
      case 'payment_intent.payment_failed':
        return await this.handleFailedPayment(data.object);
      
      case 'payment_intent.processing':
        return await this.handleProcessingPayment(data.object);
      
      case 'transfer.paid':
        return await this.handleSuccessfulPayout(data.object);
      
      default:
        console.log(`Unhandled event type ${type}`);
        return null;
    }
  }

  /**
   * Handle successful payment
   */
  static async handleSuccessfulPayment(paymentIntent) {
    const transaction = await Transaction.findByPaymentIntent(paymentIntent.id);
    if (!transaction) {
      throw new Error('Transaction not found for payment intent');
    }

    await transaction.updatePaymentStatus('succeeded');
    return transaction;
  }

  /**
   * Handle failed payment
   */
  static async handleFailedPayment(paymentIntent) {
    const transaction = await Transaction.findByPaymentIntent(paymentIntent.id);
    if (!transaction) {
      throw new Error('Transaction not found for payment intent');
    }

    await transaction.updatePaymentStatus('failed', paymentIntent.last_payment_error);
    return transaction;
  }

  /**
   * Handle processing payment
   */
  static async handleProcessingPayment(paymentIntent) {
    const transaction = await Transaction.findByPaymentIntent(paymentIntent.id);
    if (!transaction) {
      throw new Error('Transaction not found for payment intent');
    }

    await transaction.updatePaymentStatus('processing');
    return transaction;
  }

  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(payload, signature) {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }
  }
}

module.exports = PaymentService;
