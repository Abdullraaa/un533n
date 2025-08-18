const jwt = require('jsonwebtoken');
const pool = require('../database');

// IMPORTANT: Use a long, complex, and secret string in your environment variables.
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_that_should_be_in_env';

const authMiddleware = {
  required: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]; // Expects "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ message: 'Authentication token required.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const [rows] = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = ?', [decoded.userId]);
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Invalid authentication token.' });
      }
      req.user = rows[0];
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid or expired token.', error: error.message });
    }
  },

  optional: async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(); // No token, proceed as guest
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const [rows] = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = ?', [decoded.userId]);
      if (rows.length > 0) {
        req.user = rows[0];
      }
    } catch (error) {
      // Invalid token is ignored, user proceeds as guest
    }
    next();
  }
};

module.exports = authMiddleware;
