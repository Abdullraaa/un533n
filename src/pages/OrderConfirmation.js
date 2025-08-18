import React from 'react';
import { Link } from 'react-router-dom';

const OrderConfirmation = () => {
  return (
    <div className="px-8 py-16 text-center">
      <h1 className="text-4xl font-bold text-green-600 mb-4">Order Confirmed!</h1>
      <p className="text-lg text-gray-700 mb-8">Thank you for your purchase. Your order has been placed successfully.</p>
      <div className="space-x-4">
        <Link to="/shop" className="bg-blue-500 text-white py-2 px-6 rounded-full hover:bg-blue-600 transition-colors duration-300">
          Continue Shopping
        </Link>
        <Link to="/profile" className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full hover:bg-gray-400 transition-colors duration-300">
          View My Orders
        </Link>
      </div>
    </div>
  );
};

export default OrderConfirmation;
