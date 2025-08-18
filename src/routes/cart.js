const express = require('express');
const router = express.Router();
const pool = require('../database');
const authMiddleware = require('../middleware/auth'); // Assuming you will create this middleware

// Middleware to get or create a cart for a user
const getUserCart = async (req, res, next) => {
  try {
    if (req.user) { // Logged-in user
      let [cart] = await pool.query('SELECT * FROM carts WHERE user_id = ?', [req.user.id]);
      if (cart.length === 0) {
        const [newCart] = await pool.query('INSERT INTO carts (user_id) VALUES (?)', [req.user.id]);
        req.cart_id = newCart.insertId;
      } else {
        req.cart_id = cart[0].id;
      }
    } else { // Guest user
      if (!req.session.cart) {
        req.session.cart = { items: [] };
      }
      req.cart = req.session.cart;
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error accessing cart', error: error.message });
  }
};

// Get cart contents
router.get('/', authMiddleware.optional, getUserCart, async (req, res) => {
  try {
    if (req.user) {
      const [items] = await pool.query(
        `SELECT ci.id, ci.quantity, pv.id as variant_id, pv.price, pv.size, pv.color, p.name, pv.image_url
         FROM cart_items ci
         JOIN product_variants pv ON ci.variant_id = pv.id
         JOIN products p ON pv.product_id = p.id
         WHERE ci.cart_id = ?`,
        [req.cart_id]
      );
      res.json({ items });
    } else {
      res.json(req.cart);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cart items', error: error.message });
  }
});

// Add item to cart
router.post('/', authMiddleware.optional, getUserCart, async (req, res) => {
  const { variant_id, quantity } = req.body;
  if (!variant_id || !quantity) {
    return res.status(400).json({ message: 'Variant ID and quantity are required.' });
  }

  try {
    if (req.user) {
      // Logged-in user: Add to DB cart
      const [existingItem] = await pool.query(
        'SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?',
        [req.cart_id, variant_id]
      );

      if (existingItem.length > 0) {
        await pool.query(
          'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
          [quantity, existingItem[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)',
          [req.cart_id, variant_id, quantity]
        );
      }
      res.status(201).json({ message: 'Item added to cart' });
    } else {
      // Guest user: Add to session cart
      const itemIndex = req.cart.items.findIndex(item => item.variant_id === variant_id);
      if (itemIndex > -1) {
        req.cart.items[itemIndex].quantity += quantity;
      } else {
        req.cart.items.push({ variant_id, quantity });
      }
      res.status(201).json(req.cart);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error adding item to cart', error: error.message });
  }
});

// Update item quantity in cart
router.put('/:variant_id', authMiddleware.optional, getUserCart, async (req, res) => {
  const { variant_id } = req.params;
  const { quantity } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ message: 'A valid quantity is required.' });
  }

  try {
    if (req.user) {
      const [result] = await pool.query(
        'UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND variant_id = ?',
        [quantity, req.cart_id, variant_id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Item not found in cart' });
      }
      res.json({ message: 'Cart updated' });
    } else {
      const itemIndex = req.cart.items.findIndex(item => item.variant_id === variant_id);
      if (itemIndex > -1) {
        req.cart.items[itemIndex].quantity = quantity;
        res.json(req.cart);
      } else {
        res.status(404).json({ message: 'Item not found in cart' });
      }
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating cart', error: error.message });
  }
});

// Remove item from cart
router.delete('/:variant_id', authMiddleware.optional, getUserCart, async (req, res) => {
  const { variant_id } = req.params;

  try {
    if (req.user) {
      const [result] = await pool.query(
        'DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?',
        [req.cart_id, variant_id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Item not found in cart' });
      }
      res.json({ message: 'Item removed from cart' });
    } else {
      const itemIndex = req.cart.items.findIndex(item => item.variant_id === variant_id);
      if (itemIndex > -1) {
        req.cart.items.splice(itemIndex, 1);
        res.json(req.cart);
      } else {
        res.status(404).json({ message: 'Item not found in cart' });
      }
    }
  } catch (error) {
    res.status(500).json({ message: 'Error removing item from cart', error: error.message });
  }
});

// Merge session cart to DB cart on login
router.post('/merge', authMiddleware.required, async (req, res) => {
    if (!req.session.cart || req.session.cart.items.length === 0) {
        return res.status(200).json({ message: 'No session cart to merge.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [cart] = await connection.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
        const cart_id = cart[0].id;

        for (const item of req.session.cart.items) {
            const [existingItem] = await connection.query(
                'SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?',
                [cart_id, item.variant_id]
            );

            if (existingItem.length > 0) {
                await connection.query(
                    'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
                    [item.quantity, existingItem[0].id]
                );
            } else {
                await connection.query(
                    'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)',
                    [cart_id, item.variant_id, item.quantity]
                );
            }
        }

        await connection.commit();
        req.session.cart = { items: [] }; // Clear session cart
        res.json({ message: 'Cart merged successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Error merging carts', error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
