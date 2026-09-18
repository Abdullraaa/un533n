const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Shared with routes/payment.js so the recorded order total and the
// amount actually charged cannot drift apart.
const { SHIPPING_COST, CURRENCY, toMinorUnits } = require('../pricing');

// Once PaymentForm has captured the card, any rejection that produces no
// order leaves the customer's money stranded. This refunds first, then
// answers, so the rule is simple and auditable: if we took money and did not
// produce an order, we give it back.
//
// The idempotency key matters -- a retried failure would otherwise hit
// charge_already_refunded, which would escape into the generic catch and turn
// a precise 409 into a confusing 500.
async function refundAndRespond(res, { paymentIntentId, status, message, extra = {} }) {
  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `refund:${paymentIntentId}` }
    );
    return res.status(status).json({ ...extra, message: `${message} Your payment has been refunded.`, refunded: true });
  } catch (refundError) {
    // Money is captured and the refund did not go through. This needs a human,
    // so say so distinctly rather than dressing it up as a normal rejection.
    console.error('REFUND FAILED for', paymentIntentId, '-', refundError.message);
    return res.status(502).json({
      ...extra,
      message: `${message} We could not automatically refund your payment -- please contact support.`,
      refunded: false,
      payment_intent_id: paymentIntentId
    });
  }
}

// Create a new order from the user's cart
router.post('/', auth.required, async (req, res) => {
  const { shipping_address_id, billing_address_id, payment_intent_id } = req.body;

  // --- Everything below needs no database connection, so it runs before we
  // take one. In particular the Stripe round-trip used to sit inside an open
  // transaction: on a Stripe slowdown that pinned a pooled connection for the
  // full 80s timeout, and ten concurrent checkouts starved the pool for every
  // other request on the site.
  if (!shipping_address_id || !billing_address_id) {
    return res.status(400).json({ message: 'Shipping and billing address IDs are required.' });
  }
  if (!payment_intent_id) {
    return res.status(400).json({ message: 'A payment is required before an order can be created.' });
  }

  // Verify the payment actually covers THIS order before recording it.
  // Without this the id would be a decorative string: any caller could
  // post an arbitrary or someone else's intent and get a free order.
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(payment_intent_id);
  } catch (err) {
    return res.status(402).json({ message: 'Payment could not be verified.', error: err.message });
  }

  // Nothing was captured, so there is nothing to undo.
  if (intent.status !== 'succeeded') {
    return res.status(402).json({ message: `Payment has not completed (status: ${intent.status}).` });
  }
  // payment.js stamps the payer on the intent; this stops one user
  // redeeming another user's successful payment.
  if (intent.metadata?.user_id !== String(req.user.id)) {
    return res.status(403).json({ message: 'This payment belongs to another account.' });
  }

  // Has this payment already bought something? This MUST be answered before
  // any refund path below, not at the INSERT where the UNIQUE index catches
  // it. Otherwise a customer could place a valid order, change their cart so
  // the amount no longer matches, resubmit the same intent, and be refunded
  // by the mismatch branch -- keeping the goods and the money.
  const [alreadyUsed] = await pool.query(
    'SELECT id FROM orders WHERE payment_intent_id = ?', [payment_intent_id]
  );
  if (alreadyUsed.length > 0) {
    return res.status(409).json({
      message: 'This payment has already been used for an order.',
      orderId: alreadyUsed[0].id
    });
  }

  // --- From here on we hold a connection and an open transaction. Only work
  // that must be consistent with the rows we are about to write belongs here.
  // Acquiring the connection can itself fail (pool exhausted, DB down), and
  // by this point the card is already charged -- so it needs the same
  // refund-and-answer treatment as any other post-capture failure. Left
  // unguarded it would reject with no response at all and hang the request.
  let connection;
  try {
    connection = await pool.getConnection();
  } catch (error) {
    console.error('Could not acquire a connection for order creation:', error.message);
    return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 503,
      message: 'We could not reach the database to record your order.' });
  }

  try {
    await connection.beginTransaction();

    // Ownership, not just existence. The foreign key to addresses(id) proves
    // the row exists, not whose it is -- without this a caller could attach a
    // stranger's address to their order, and GET /api/orders would render it
    // straight back to them.
    const [ownedAddresses] = await connection.query(
      'SELECT id FROM addresses WHERE id IN (?, ?) AND user_id = ?',
      [shipping_address_id, billing_address_id, req.user.id]
    );
    const distinctRequested = new Set([String(shipping_address_id), String(billing_address_id)]).size;
    if (ownedAddresses.length !== distinctRequested) {
      await connection.rollback();
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 404,
        message: 'Address not found or you do not have permission to use it.' });
    }

    // Get the user's cart
    const [cart] = await connection.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
    if (cart.length === 0) {
      await connection.rollback();
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 400,
        message: 'Cart not found for this user.' });
    }
    const cart_id = cart[0].id;

    // Get cart items
    const [cartItems] = await connection.query(
      `SELECT ci.quantity, pv.id as variant_id, pv.price, pv.stock_quantity
       FROM cart_items ci
       JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.cart_id = ?`,
      [cart_id]
    );

    if (cartItems.length === 0) {
      await connection.rollback();
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 400,
        message: 'Cart is empty.' });
    }

    // Check stock and calculate total amount
    let totalAmount = 0;
    for (const item of cartItems) {
      if (item.quantity > item.stock_quantity) {
        await connection.rollback();
        return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 409,
          message: `Not enough stock for variant ${item.variant_id}; only ${item.stock_quantity} left.` });
      }
      totalAmount += item.quantity * item.price;
    }
    totalAmount += SHIPPING_COST;

    // Currency and amount are compared here, inside the transaction, because
    // totalAmount derives from the in-transaction read above.
    if (intent.currency !== CURRENCY) {
      await connection.rollback();
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 409,
        message: `Payment currency ${intent.currency} does not match ${CURRENCY}.` });
    }
    if (intent.amount !== toMinorUnits(totalAmount)) {
      await connection.rollback();
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 409,
        message: 'Payment amount does not match the order total. The cart may have changed after payment.',
        extra: { paid: intent.amount, expected: toMinorUnits(totalAmount) } });
    }

    // Create the order
    let orderResult;
    try {
      [orderResult] = await connection.query(
        'INSERT INTO orders (user_id, total_amount, shipping_address_id, billing_address_id, payment_intent_id) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, totalAmount, shipping_address_id, billing_address_id, payment_intent_id]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        // Backstop for the narrow race where two requests carrying the same
        // intent get past the pre-check above concurrently. The UNIQUE index
        // makes one payment -> one order structural rather than something the
        // UI has to be careful about. No refund here: the money is correctly
        // tied to the order named below.
        await connection.rollback();
        // rollback ends the transaction but leaves this connection usable,
        // so reuse it rather than acquiring a second one from the pool.
        const [[existing]] = await connection.query(
          'SELECT id FROM orders WHERE payment_intent_id = ?', [payment_intent_id]
        );
        return res.status(409).json({
          message: 'This payment has already been used for an order.',
          orderId: existing ? existing.id : undefined
        });
      }
      throw err;
    }
    const orderId = orderResult.insertId;

    // Create order items and update stock
    for (const item of cartItems) {
      await connection.query(
        'INSERT INTO order_items (order_id, variant_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.variant_id, item.quantity, item.price]
      );
      // Guarded: the SELECT above takes no locks and stock_quantity is a
      // signed INT, so two checkouts for the last unit would both pass the
      // check and both decrement, leaving -1. Doing the test and the
      // decrement in one statement makes it atomic.
      const [dec] = await connection.query(
        'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
        [item.quantity, item.variant_id, item.quantity]
      );
      if (dec.affectedRows === 0) {
        await connection.rollback();
        return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 409,
          message: `Variant ${item.variant_id} sold out while you were checking out.` });
      }
    }

    // Clear the user's cart
    await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cart_id]);

    await connection.commit();
    res.status(201).json({ message: 'Order created successfully', orderId, payment_intent_id });
  } catch (error) {
    // A throwing rollback must not swallow the response: without this the
    // request would hang until the client timed out.
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Rollback failed during order creation:', rollbackError.message);
    }

    console.error('Order creation failed:', error.code || '(no code)', error.message);

    // Contention between two checkouts for the same variant surfaces as one
    // of these, depending on engine and timing. The stock invariant still
    // holds -- the losing transaction is rolled back -- so this is contention,
    // not a server fault, and gets a 409 rather than a 500 carrying a raw
    // database string.
    const CONTENTION = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_CHECKREAD'];
    if (CONTENTION.includes(error.code)) {
      return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 409,
        message: 'Another order for one of these items completed first.' });
    }

    return refundAndRespond(res, { paymentIntentId: payment_intent_id, status: 500,
      message: 'Something went wrong creating your order.' });
  } finally {
    connection.release();
  }
});

// Get user's order history
router.get('/', auth.required, async (req, res) => {
  try {
    const [orders] = await pool.query(
        `SELECT o.*, 
         JSON_OBJECT('line1', sa.address_line1, 'city', sa.city, 'state', sa.state, 'postal_code', sa.postal_code) as shipping_address,
         JSON_OBJECT('line1', ba.address_line1, 'city', ba.city, 'state', ba.state, 'postal_code', ba.postal_code) as billing_address
         FROM orders o
         LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
         LEFT JOIN addresses ba ON o.billing_address_id = ba.id
         WHERE o.user_id = ? ORDER BY o.order_date DESC`,
        [req.user.id]
    );
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching order history', error: error.message });
  }
});

// Get a single order by ID
router.get('/:id', auth.required, async (req, res) => {
  try {
    const { id } = req.params;
    const [order] = await pool.query(
        `SELECT o.*, 
         JSON_OBJECT('line1', sa.address_line1, 'city', sa.city, 'state', sa.state, 'postal_code', sa.postal_code) as shipping_address,
         JSON_OBJECT('line1', ba.address_line1, 'city', ba.city, 'state', ba.state, 'postal_code', ba.postal_code) as billing_address
         FROM orders o
         LEFT JOIN addresses sa ON o.shipping_address_id = sa.id
         LEFT JOIN addresses ba ON o.billing_address_id = ba.id
         WHERE o.id = ? AND o.user_id = ?`,
        [id, req.user.id]
    );

    if (order.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [items] = await pool.query(
      `SELECT oi.quantity, oi.price, pv.size, pv.color, p.name
       FROM order_items oi
       JOIN product_variants pv ON oi.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE oi.order_id = ?`,
      [id]
    );

    res.json({ ...order[0], items });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching order details', error: error.message });
  }
});

// Update order status (admin only)
router.put('/:id/status', auth.admin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status value.' });
        }

        const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        res.json({ message: `Order status updated to ${status}` });
    } catch (error) {
        res.status(500).json({ message: 'Error updating order status', error: error.message });
    }
});

module.exports = router;
