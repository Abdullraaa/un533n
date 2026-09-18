import React, { useState, useEffect } from 'react';
import { useStoreContext } from '../components/StoreProvider';
import { useNavigate } from 'react-router-dom';
import PaymentForm from '../components/PaymentForm'; // Import the PaymentForm component

const Checkout = () => {
  const navigate = useNavigate();
  const { cart, fetchCart, user, token, addresses, fetchAddresses, addAddress, createOrder } = useStoreContext();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedShippingAddress, setSelectedShippingAddress] = useState(null);
  const [selectedBillingAddress, setSelectedBillingAddress] = useState(null);
  const [newAddressForm, setNewAddressForm] = useState({
    address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping'
  });
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCart();
    if (user && token) {
      fetchAddresses();
    }
  }, [fetchCart, user, token, fetchAddresses]);

  // The backend has never supported guest orders (POST /api/orders is
  // auth.required, and the store's createOrder throws without a token), but
  // the UI still let a logged-out user reach payment and be charged with no
  // order recorded. Gate the payment step instead of adding guest orders.
  useEffect(() => {
    if (!token && currentStep >= 3) {
      navigate('/login', { replace: true, state: { from: '/checkout' } });
    }
  }, [token, currentStep, navigate]);

  const items = Array.isArray(cart?.items) ? cart.items : [];
  const subtotal = items.reduce((acc, item) => acc + Number(item.price || 0) * item.quantity, 0);
  // Totals come from the server (GET /api/cart -> src/pricing.js), so the page
  // can never display a shipping or total figure the backend disagrees with.
  // The local reduce is only a fallback before the first fetch resolves.
  const shippingCost = Number(cart?.shipping ?? 0);
  const subtotalShown = Number(cart?.subtotal ?? subtotal);
  const totalAmount = Number(cart?.total ?? subtotal + shippingCost);

  const handleNextStep = () => {
    setCurrentStep(currentStep + 1);
  };

  const handlePrevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleAddAddress = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addAddress(newAddressForm);
      setNewAddressForm({ address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: '', address_type: 'shipping' });
      setShowNewAddressForm(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add address.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntent) => {
    // This function is called by PaymentForm on successful payment
    // Now, place the order in your backend
    setLoading(true);
    setError(null);
    try {
      if (!selectedShippingAddress || !selectedBillingAddress) {
        setError('Please select both shipping and billing addresses.');
        return;
      }
      await createOrder({
        shipping_address_id: selectedShippingAddress,
        billing_address_id: selectedBillingAddress,
        // The server derives shipping and the total itself; it only needs
        // the intent, which it verifies against the order before recording.
        payment_intent_id: paymentIntent?.id,
      });
      alert('Order placed successfully!');
      navigate('/order-confirmation'); // Redirect to an order confirmation page
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to place order after payment.');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentError = (message) => {
    setError(message);
  };

  return (
    <div className="px-8 py-16">
      <h1 className="text-3xl font-bold text-center mb-8">Checkout</h1>
      <div className="max-w-6xl mx-auto bg-white text-primary shadow-md rounded-lg p-4 sm:p-8">
        <div className="grid grid-cols-2 gap-2 md:flex md:justify-between mb-8">
          <button onClick={() => setCurrentStep(1)} className={`px-2 py-2 text-xs md:text-base md:px-4 rounded-md ${currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>1. Cart Review</button>
          <button onClick={() => setCurrentStep(2)} className={`px-2 py-2 text-xs md:text-base md:px-4 rounded-md ${currentStep === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>2. Shipping</button>
          <button onClick={() => setCurrentStep(3)} className={`px-2 py-2 text-xs md:text-base md:px-4 rounded-md ${currentStep === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>3. Payment</button>
          <button onClick={() => setCurrentStep(4)} className={`px-2 py-2 text-xs md:text-base md:px-4 rounded-md ${currentStep === 4 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>4. Confirmation</button>
        </div>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

        {/* Step 1: Cart Review */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Cart Review</h2>
            {items.length === 0 ? (
              <p>Your cart is empty. Please add items to proceed to checkout.</p>
            ) : (
              <div>
                {items.map(item => (
                  <div key={item.variant_id} className="flex flex-wrap gap-2 justify-between items-center border-b py-2">
                    <span>{item.name} ({item.size}, {item.color}) x {item.quantity}</span>
                    <span>${(Number(item.price || 0) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="text-right font-bold text-lg mt-4">
                  Subtotal: ${subtotalShown.toFixed(2)}
                </div>
                <button onClick={handleNextStep} className="mt-6 bg-accent text-un-black font-bold py-2 px-6 rounded-full w-full sm:w-auto sm:float-right">Next: Shipping</button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Shipping Information */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Shipping Information</h2>
            {user && addresses.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Select Existing Address</h3>
                {addresses.map(addr => (
                  <div key={addr.id} className="border p-3 rounded-md mb-2">
                    <label className="inline-flex items-center">
                      <input 
                        type="radio" 
                        name="shippingAddress"
                        value={addr.id}
                        checked={selectedShippingAddress === addr.id}
                        onChange={() => setSelectedShippingAddress(addr.id)}
                        className="form-radio"
                      />
                      <span className="ml-2">{addr.address_line1}, {addr.city}, {addr.state} {addr.postal_code}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowNewAddressForm(!showNewAddressForm)} className="text-blue-500 hover:underline mb-4">
              {showNewAddressForm ? 'Hide Form' : 'Add New Address'}
            </button>

            {showNewAddressForm && (
              <form onSubmit={handleAddAddress} className="space-y-4 mb-4">
                <input type="text" placeholder="Address Line 1" value={newAddressForm.address_line1} onChange={(e) => setNewAddressForm({...newAddressForm, address_line1: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" required />
                <input type="text" placeholder="Address Line 2" value={newAddressForm.address_line2} onChange={(e) => setNewAddressForm({...newAddressForm, address_line2: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" />
                <input type="text" placeholder="City" value={newAddressForm.city} onChange={(e) => setNewAddressForm({...newAddressForm, city: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" required />
                <input type="text" placeholder="State" value={newAddressForm.state} onChange={(e) => setNewAddressForm({...newAddressForm, state: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" required />
                <input type="text" placeholder="Postal Code" value={newAddressForm.postal_code} onChange={(e) => setNewAddressForm({...newAddressForm, postal_code: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" required />
                <input type="text" placeholder="Country" value={newAddressForm.country} onChange={(e) => setNewAddressForm({...newAddressForm, country: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary" required />
                <select value={newAddressForm.address_type} onChange={(e) => setNewAddressForm({...newAddressForm, address_type: e.target.value})} className="w-full p-2 border border-gray-300 rounded bg-white text-primary">
                  <option value="shipping">Shipping</option>
                  <option value="billing">Billing</option>
                </select>
                <button type="submit" className="bg-green-500 text-white py-2 px-4 rounded-md" disabled={loading}>Add Address</button>
              </form>
            )}

            <div className="flex flex-wrap gap-3 justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
              <button onClick={handleNextStep} className="bg-accent text-un-black font-bold py-2 px-6 rounded-full" disabled={!selectedShippingAddress}>Next: Payment</button>
            </div>
          </div>
        )}

        {/* Step 3: Payment Information */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Payment Information</h2>
            {user && addresses.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Select Billing Address</h3>
                {addresses.map(addr => (
                  <div key={addr.id} className="border p-3 rounded-md mb-2">
                    <label className="inline-flex items-center">
                      <input 
                        type="radio" 
                        name="billingAddress"
                        value={addr.id}
                        checked={selectedBillingAddress === addr.id}
                        onChange={() => setSelectedBillingAddress(addr.id)}
                        className="form-radio"
                      />
                      <span className="ml-2">{addr.address_line1}, {addr.city}, {addr.state} {addr.postal_code}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            <PaymentForm 
              totalAmount={totalAmount} 
              onPaymentSuccess={handlePaymentSuccess} 
              onPaymentError={handlePaymentError} 
            />
            <div className="flex flex-wrap gap-3 justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
              <button onClick={handleNextStep} className="bg-accent text-un-black font-bold py-2 px-6 rounded-full" disabled={!selectedBillingAddress}>Next: Confirmation</button>
            </div>
          </div>
        )}

        {/* Step 4: Order Confirmation */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Order Confirmation</h2>
            <div className="mb-4">
              <h3 className="text-xl font-semibold">Items:</h3>
              {items.map(item => (
                <div key={item.variant_id} className="flex justify-between items-center py-1">
                  <span>{item.name} ({item.size}, {item.color}) x {item.quantity}</span>
                  <span>${(Number(item.price || 0) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <h3 className="text-xl font-semibold">Shipping Address:</h3>
              {selectedShippingAddress && (
                <p>{addresses.find(addr => addr.id === selectedShippingAddress)?.address_line1}, {addresses.find(addr => addr.id === selectedShippingAddress)?.city}</p>
              )}
            </div>
            <div className="mb-4">
              <h3 className="text-xl font-semibold">Billing Address:</h3>
              {selectedBillingAddress && (
                <p>{addresses.find(addr => addr.id === selectedBillingAddress)?.address_line1}, {addresses.find(addr => addr.id === selectedBillingAddress)?.city}</p>
              )}
            </div>
            <div className="text-right font-bold text-xl mt-4">
              <p>Subtotal: ${subtotalShown.toFixed(2)}</p>
              <p>Shipping: ${shippingCost.toFixed(2)}</p>
              <p>Total: ${totalAmount.toFixed(2)}</p>
            </div>
            {/* No "Place Order" button here: PaymentForm already calls
                handlePaymentSuccess once the payment succeeds. A second
                trigger created a duplicate order for a single payment, and
                passed a click event where a PaymentIntent was expected. */}
            <div className="flex flex-wrap gap-3 justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
