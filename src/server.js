require('dotenv').config();
const express = require('express');
const session = require('express-session');
const app = express();
const port = process.env.PORT || 3002;

const usersRoutes = require('./routes/users');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const ordersRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment'); // New: Payment routes

app.use(express.json());
app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your_default_session_secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' } // set to true if using https
}));

app.use('/api/users', usersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payment', paymentRoutes); // New: Use payment routes

// Unmatched API paths must fail as JSON. Without this the SPA catch-all
// below would answer them with index.html and a 200, so axios would choke
// on HTML instead of seeing a clean 404.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// SPA catch-all: BrowserRouter paths must survive direct navigation and
// refresh. Runs after express.static, so real files still win.
// NOTE: '*' is Express 4 syntax; Express 5 requires '/*splat'.
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
