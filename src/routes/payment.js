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
    const { shipping_address_id, billing_address_id } = req.body;

    // Everything below runs BEFORE stripe.paymentIntents.create, so a cart
    // that cannot become an order never reaches the card. These same
    // conditions used to be caught only inside the order transaction --
    // i.e. after capture, with no way back.
    if (!shipping_address_id || !billing_address_id) {
      return res.status(400).json({ message: 'Shipping and billing address IDs are required.' });
    }

    // Ownership, not just existence: the foreign key would happily accept
    // another user's address id.
    const [ownedAddresses] = await pool.query(
      'SELECT id FROM addresses WHERE id IN (?, ?) AND user_id = ?',
      [shipping_address_id, billing_address_id, req.user.id]
    );
    const distinctRequested = new Set([String(shipping_address_id), String(billing_address_id)]).size;
    if (ownedAddresses.length !== distinctRequested) {
      return res.status(404).json({ message: 'Address not found or you do not have permission to use it.' });
    }

    const { itemCount, subtotal, shipping, total, outOfStock } = await cartTotalForUser(req.user.id);

    if (itemCount === 0 || total <= 0) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    if (outOfStock.length > 0) {
      return res.status(409).json({
        message: 'Some items are no longer available in the quantity requested.',
        outOfStock
      });
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

module.exports = router;
