const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const auth = require('../middleware/auth');
const pool = require('../database');
const { CURRENCY, cartTotalForUser, toMinorUnits } = require('../pricing');

// Endpoint to create a Payment Intent.
// The amount and currency are derived from the caller's cart in the
// database and never read from the request body -- otherwise a client can
// name its own price for any cart.
router.post('/create-payment-intent', auth.required, async (req, res) => {
  try {
    const { itemCount, subtotal, shipping, total } = await cartTotalForUser(req.user.id);

    if (itemCount === 0 || total <= 0) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: toMinorUnits(total),
      currency: CURRENCY,
      metadata: { user_id: String(req.user.id) },
    });

    res.status(200).send({
      clientSecret: paymentIntent.client_secret,
      // Echoed so the UI can display what will be charged; the charge
      // itself is already fixed server-side above.
      subtotal,
      shipping,
      total,
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
