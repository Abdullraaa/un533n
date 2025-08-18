import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './components/StoreProvider';
import Home from './pages/Home';
import Shop from './pages/Shop';
import About from './pages/About';
import Contact from './pages/Contact';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import ProductDetail from './pages/ProductDetail';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Profile from './pages/Profile';
import OrderConfirmation from './pages/OrderConfirmation'; // New: Order Confirmation Page

import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Make sure to call `loadStripe` outside of a component’s render to avoid
// recreating the `Stripe` object on every render.
const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_your_stripe_publishable_key');

const App = () => {
  return (
    <StoreProvider>
      <Elements stripe={stripePromise}> {/* Wrap with Elements */}
        <Router>
          <Routes>
            <Route path="/" exact element={<Home />} />
            <Route path="/shop" exact element={<Shop />} />
            <Route path="/about" exact element={<About />} />
            <Route path="/contact" exact element={<Contact />} />
            <Route path="/cart" exact element={<Cart />} />
            <Route path="/checkout" exact element={<Checkout />} />
            <Route path="/product/:id" exact element={<ProductDetail />} />
            <Route path="/login" exact element={<Login />} />
            <Route path="/signup" exact element={<Signup />} />
            <Route path="/profile" exact element={<Profile />} />
            <Route path="/order-confirmation" exact element={<OrderConfirmation />} /> {/* New Route */}
          </Routes>
        </Router>
      </Elements>
    </StoreProvider>
  );
};

export default App;
