const express = require('express');
const router = express.Router();
const pool = require('../database');
const auth = require('../middleware/auth');

// Add item to wishlist
router.post('/', auth.required, async (req, res) => {
  try {
    const { variant_id } = req.body;
    if (!variant_id) {
      return res.status(400).json({ message: 'Variant ID is required.' });
    }

    // Check if the item is already in the wishlist
    const [existing] = await pool.query(
      'SELECT id FROM wishlists WHERE user_id = ? AND variant_id = ?',
      [req.user.id, variant_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Item already in wishlist.' });
    }

    const [result] = await pool.query(
      'INSERT INTO wishlists (user_id, variant_id) VALUES (?, ?)',
      [req.user.id, variant_id]
    );
    res.status(201).json({ message: 'Item added to wishlist', wishlistItemId: result.insertId });
  } catch (error) {
    res.status(500).json({ message: 'Error adding item to wishlist', error: error.message });
  }
});

// Get user's wishlist
router.get('/', auth.required, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT w.id as wishlist_id, pv.*, p.name, p.description
       FROM wishlists w
       JOIN product_variants pv ON w.variant_id = pv.id
       JOIN products p ON pv.product_id = p.id
       WHERE w.user_id = ?`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wishlist', error: error.message });
  }
});

// Remove item from wishlist
router.delete('/:variant_id', auth.required, async (req, res) => {
  try {
    const { variant_id } = req.params;
    const [result] = await pool.query(
      'DELETE FROM wishlists WHERE user_id = ? AND variant_id = ?',
      [req.user.id, variant_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Item not found in wishlist.' });
    }

    res.json({ message: 'Item removed from wishlist' });
  } catch (error) {
    res.status(500).json({ message: 'Error removing item from wishlist', error: error.message });
  }
});

module.exports = router;
