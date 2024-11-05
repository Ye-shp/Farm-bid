// controllers/payoutController.js
const stripe = require('stripe')('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');
const User = require('../models/User'); 
const Payout = require('../models/Payout'); 

// Function to get the user balance and payout history
const getUserBalance = async (userId) => {
  try {
    // Fetch user balance from the User model
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Fetch the user's payout history
    const payoutHistory = await Payout.find({ userId }).sort({ date: -1 });

    // Return balance and payout history
    return {
      balance: user.balance || 0,
      payoutHistory: payoutHistory.map((payout) => ({
        id: payout._id,
        amount: payout.amount,
        date: payout.date,
      })),
    };
  } catch (error) {
    console.error('Error fetching user balance:', error);
    throw error;
  }
};

// Function to handle payout requests
const requestPayout = async (userId, amount) => {
  try {
    // Fetch the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if the user has enough balance for the payout
    if (user.balance < amount) {
      throw new Error('Insufficient balance');
    }

    // Create a Stripe payout (replace `destination` with your user's bank account or card ID)
    const payout = await stripe.payouts.create({
      amount,
      currency: 'usd',
      destination: 'your-seller-bank-account-id', // Replace this with an actual bank account or card ID
    });

    // Update user balance
    user.balance -= amount;
    await user.save();

    // Record the payout in the Payout model
    const newPayout = new Payout({
      userId,
      amount,
      date: new Date(),
      stripePayoutId: payout.id,
    });
    await newPayout.save();

    return { success: true, payout };
  } catch (error) {
    console.error('Error processing payout:', error);
    throw error;
  }
};

module.exports = {
  getUserBalance,
  requestPayout,
};
