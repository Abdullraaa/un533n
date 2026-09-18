const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Shared with routes/payment.js so the recorded order total and the
// amount actually charged cannot drift apart.
const { SHIPPING_COST, CURRENCY, toMinorUnits } = require('../pricing');

// Create a new order from the user's cart
router.post('/', auth.required, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { shipping_address_id, billing_address_id, payment_intent_id } = req.body;
    if (!shipping_address_id || !billing_address_id) {
      await connection.rollback();
      return res.status(400).json({ message: 'Shipping and billing address IDs are required.' });
    }
    if (!payment_intent_id) {
      await connection.rollback();
      return res.status(400).json({ message: 'A payment is required before an order can be created.' });
    }

    // Get the user's cart
    const [cart] = await connection.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
    if (cart.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Cart not found for this user.' });
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
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    // Check stock and calculate total amount
    let totalAmount = 0;
    for (const item of cartItems) {
      if (item.quantity > item.stock_quantity) {
        await connection.rollback();
        return res.status(400).json({ message: `Not enough stock for variant ${item.variant_id}. Only ${item.stock_quantity} left.` });
      }
      totalAmount += item.quantity * item.price;
    }
    totalAmount += SHIPPING_COST;

    // Verify the payment actually covers THIS order before recording it.
    // Without this the id would be a decorative string: any caller could
    // post an arbitrary or someone else's intent and get a free order.
    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    } catch (err) {
      await connection.rollback();
      return res.status(402).json({ message: 'Payment could not be verified.', error: err.message });
    }

    if (intent.status !== 'succeeded') {
      await connection.rollback();
      return res.status(402).json({ message: `Payment has not completed (status: ${intent.status}).` });
    }
    // payment.js stamps the payer on the intent; this stops one user
    // redeeming another user's successful payment.
    if (intent.metadata?.user_id !== String(req.user.id)) {
      await connection.rollback();
      return res.status(403).json({ message: 'This payment belongs to another account.' });
    }
    // Recomputed from the rows we are about to commit, so a cart changed
    // after payment is caught rather than silently under- or over-charged.
    if (intent.currency !== CURRENCY) {
      await connection.rollback();
      return res.status(409).json({
        message: `Payment currency ${intent.currency} does not match ${CURRENCY}.`
      });
    }
    if (intent.amount !== toMinorUnits(totalAmount)) {
      await connection.rollback();
      return res.status(409).json({
        message: 'Payment amount does not match the order total. The cart may have changed after payment.',
        paid: intent.amount,
        expected: toMinorUnits(totalAmount)
      });
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
        // The UNIQUE index makes one payment -> one order structural,
        // rather than something the UI has to be careful about.
        await connection.rollback();
        const [[existing]] = await pool.query(
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
      await connection.query(
        'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?',
        [item.quantity, item.variant_id]
      );
    }

    // Clear the user's cart
    await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cart_id]);

    await connection.commit();
    res.status(201).json({ message: 'Order created successfully', orderId, payment_intent_id });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Error creating order', error: error.message });
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
