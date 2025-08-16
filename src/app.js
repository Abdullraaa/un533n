const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Define a route for the homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Define routes for other pages
app.get('/shop', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/shop.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/contact.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/cart.html'));
});

app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/checkout.html'));
});

app.get('/product-detail', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/product-detail.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
