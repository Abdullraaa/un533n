const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const auth = require('../middleware/auth');
const pool = require('../database');

// Endpoint to create a Payment Intent
router.post('/create-payment-intent', auth.required, async (req, res) => {
  const { amount, currency } = req.body; // Amount should be in cents

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      metadata: { integration_check: 'accept_a_payment' },
      // Add more details like customer, description, etc. as needed
    });

    res.status(200).send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating payment intent', error: error.message });
  }
});

// Endpoint to confirm a Payment Intent (optional, can be done on frontend)
router.post('/confirm-payment-intent', auth.required, async (req, res) => {
  const { paymentIntentId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId);
    res.status(200).json(paymentIntent);
  } catch (error) {
    res.status(500).json({ message: 'Error confirming payment intent', error: error.message });
  }
});

module.exports = router;
