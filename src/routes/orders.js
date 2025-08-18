const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// Create a new order from the user's cart
router.post('/', auth.required, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { shipping_address_id, billing_address_id } = req.body;
    if (!shipping_address_id || !billing_address_id) {
      return res.status(400).json({ message: 'Shipping and billing address IDs are required.' });
    }

    // Get the user's cart
    const [cart] = await connection.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
    if (cart.length === 0) {
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

    // Create the order
    const [orderResult] = await connection.query(
      'INSERT INTO orders (user_id, total_amount, shipping_address_id, billing_address_id) VALUES (?, ?, ?, ?)',
      [req.user.id, totalAmount, shipping_address_id, billing_address_id]
    );
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
    res.status(201).json({ message: 'Order created successfully', orderId });
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

// Update order status (Admin only - a proper role check should be implemented)
router.put('/:id/status', auth.required, async (req, res) => {
    // TODO: Add a check to ensure only admins can update order status
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
