import React, { useEffect } from 'react';
import { useStoreContext } from '../components/StoreProvider';
import { Link } from 'react-router-dom';

const Cart = () => {
  const { cart, fetchCart, updateCartItemQuantity, removeFromCart } = useStoreContext();

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const handleUpdateQuantity = (variant_id, quantity) => {
    updateCartItemQuantity(variant_id, parseInt(quantity));
  };

  const handleRemoveItem = (variant_id) => {
    removeFromCart(variant_id);
  };

  // `price` is DECIMAL; the pool coerces it, but stay defensive so a bad
  // payload renders as $0.00 rather than throwing mid-render.
  const items = Array.isArray(cart?.items) ? cart.items : [];
  // Server-computed (GET /api/cart); the reduce is a pre-fetch fallback only.
  const subtotal = Number(cart?.subtotal ?? items.reduce((acc, item) => acc + Number(item.price || 0) * item.quantity, 0));

  return (
    <div className="px-8 py-16">
      <h1 className="text-3xl font-bold text-center mb-8">Shopping Cart</h1>
      <div className="max-w-4xl mx-auto">
        {items.length === 0 ? (
          <p className="text-center text-lg">Your cart is empty.</p>
        ) : (
          <div className="bg-white text-primary shadow-md rounded-lg p-6">
            {items.map(item => (
              <div key={item.variant_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 py-4 last:border-b-0">
                <div className="flex items-center gap-4 min-w-0">
                  <img src={item.image_url || '/imgs/csoonpng.png'} alt={item.name} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-md shrink-0" />
                  <div>
                    <h3 className="font-bold text-lg">{item.name}</h3>
                    <p className="text-gray-600 text-sm">Size: {item.size} | Color: {item.color}</p>
                    <p className="text-gray-800 font-semibold mt-1">${Number(item.price || 0).toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <input 
                    type="number" 
                    value={item.quantity}
                    onChange={(e) => handleUpdateQuantity(item.variant_id, e.target.value)}
                    min="1"
                    className="w-20 border border-gray-300 rounded-md text-center py-1"
                  />
                  <p className="font-semibold text-lg w-20 text-right">${(Number(item.price || 0) * item.quantity).toFixed(2)}</p>
                  <button 
                    onClick={() => handleRemoveItem(item.variant_id)}
                    className="text-red-500 hover:text-red-700 transition-colors duration-200"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="mt-6 text-right">
              <p className="text-xl font-bold">Subtotal: <span className="text-accent">${subtotal.toFixed(2)}</span></p>
              <Link to="/checkout" className="mt-6 inline-block bg-accent text-un-black py-3 px-8 rounded-full font-bold text-lg hover:bg-accent-dark transition-colors duration-300">
                Proceed to Checkout
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;