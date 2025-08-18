const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../database');

// User Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, first_name, last_name]
    );
    res.status(201).json({ message: 'User created successfully', userId: result.insertId });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error });
  }
});

// User Login
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../database');
const auth = require('../middleware/auth');

// IMPORTANT: Use a long, complex, and secret string in your environment variables.
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_that_should_be_in_env';

// User Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;
    if (!email || !password || !first_name || !last_name) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, first_name, last_name]
    );
    res.status(201).json({ message: 'User created successfully', userId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Logged in successfully', token });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
});

// Get user profile
router.get('/profile', auth.required, (req, res) => {
  // The user object is attached to the request by the auth middleware
  res.json(req.user);
});

// Update user profile
router.put('/profile', auth.required, async (req, res) => {
  try {
    const { first_name, last_name } = req.body;
    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [first_name, last_name, req.user.id]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
});

// --- Address Management ---

// Get all addresses for a user
router.get('/addresses', auth.required, async (req, res) => {
    try {
        const [addresses] = await pool.query('SELECT * FROM addresses WHERE user_id = ?', [req.user.id]);
        res.json(addresses);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching addresses', error: error.message });
    }
});

// Add a new address
router.post('/addresses', auth.required, async (req, res) => {
    try {
        const { address_line1, address_line2, city, state, postal_code, country, address_type } = req.body;
        const [result] = await pool.query(
            'INSERT INTO addresses (user_id, address_line1, address_line2, city, state, postal_code, country, address_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [req.user.id, address_line1, address_line2, city, state, postal_code, country, address_type]
        );
        res.status(201).json({ message: 'Address added successfully', addressId: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Error adding address', error: error.message });
    }
});

// Update an address
router.put('/addresses/:id', auth.required, async (req, res) => {
    try {
        const { id } = req.params;
        const { address_line1, address_line2, city, state, postal_code, country, address_type } = req.body;
        const [result] = await pool.query(
            'UPDATE addresses SET address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?, address_type = ? WHERE id = ? AND user_id = ?',
            [address_line1, address_line2, city, state, postal_code, country, address_type, id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Address not found or you do not have permission to edit it.' });
        }
        res.json({ message: 'Address updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating address', error: error.message });
    }
});

// Delete an address
router.delete('/addresses/:id', auth.required, async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Address not found or you do not have permission to delete it.' });
        }
        res.json({ message: 'Address deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting address', error: error.message });
    }
});

module.exports = router;
  try {
    const { email, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id }, 'your_jwt_secret', { expiresIn: '1h' });
    res.json({ message: 'Logged in successfully', token });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
});

module.exports = router;