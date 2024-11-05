const express = require('express');
const Stripe = require('stripe');
const app = express();
const stripe = Stripe('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');

app.use(express.json());

app.post('/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
