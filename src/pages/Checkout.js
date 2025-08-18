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

  const subtotal = cart.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const shippingCost = 10; // Example static shipping cost
  const totalAmount = subtotal + shippingCost;

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
        payment_intent_id: paymentIntent.id, // Pass the payment intent ID to your backend
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
      <div className="max-w-6xl mx-auto bg-white shadow-md rounded-lg p-8">
        <div className="flex justify-between mb-8">
          <button onClick={() => setCurrentStep(1)} className={`px-4 py-2 rounded-md ${currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>1. Cart Review</button>
          <button onClick={() => setCurrentStep(2)} className={`px-4 py-2 rounded-md ${currentStep === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>2. Shipping</button>
          <button onClick={() => setCurrentStep(3)} className={`px-4 py-2 rounded-md ${currentStep === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>3. Payment</button>
          <button onClick={() => setCurrentStep(4)} className={`px-4 py-2 rounded-md ${currentStep === 4 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>4. Confirmation</button>
        </div>

        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

        {/* Step 1: Cart Review */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Cart Review</h2>
            {cart.items.length === 0 ? (
              <p>Your cart is empty. Please add items to proceed to checkout.</p>
            ) : (
              <div>
                {cart.items.map(item => (
                  <div key={item.variant_id} className="flex justify-between items-center border-b py-2">
                    <span>{item.name} ({item.size}, {item.color}) x {item.quantity}</span>
                    <span>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="text-right font-bold text-lg mt-4">
                  Subtotal: ${subtotal.toFixed(2)}
                </div>
                <button onClick={handleNextStep} className="mt-6 bg-accent text-white py-2 px-6 rounded-full float-right">Next: Shipping</button>
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
                <input type="text" placeholder="Address Line 1" value={newAddressForm.address_line1} onChange={(e) => setNewAddressForm({...newAddressForm, address_line1: e.target.value})} className="w-full p-2 border rounded" required />
                <input type="text" placeholder="Address Line 2" value={newAddressForm.address_line2} onChange={(e) => setNewAddressForm({...newAddressForm, address_line2: e.target.value})} className="w-full p-2 border rounded" />
                <input type="text" placeholder="City" value={newAddressForm.city} onChange={(e) => setNewAddressForm({...newAddressForm, city: e.target.value})} className="w-full p-2 border rounded" required />
                <input type="text" placeholder="State" value={newAddressForm.state} onChange={(e) => setNewAddressForm({...newAddressForm, state: e.target.value})} className="w-full p-2 border rounded" required />
                <input type="text" placeholder="Postal Code" value={newAddressForm.postal_code} onChange={(e) => setNewAddressForm({...newAddressForm, postal_code: e.target.value})} className="w-full p-2 border rounded" required />
                <input type="text" placeholder="Country" value={newAddressForm.country} onChange={(e) => setNewAddressForm({...newAddressForm, country: e.target.value})} className="w-full p-2 border rounded" required />
                <select value={newAddressForm.address_type} onChange={(e) => setNewAddressForm({...newAddressForm, address_type: e.target.value})} className="w-full p-2 border rounded">
                  <option value="shipping">Shipping</option>
                  <option value="billing">Billing</option>
                </select>
                <button type="submit" className="bg-green-500 text-white py-2 px-4 rounded-md" disabled={loading}>Add Address</button>
              </form>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
              <button onClick={handleNextStep} className="bg-accent text-white py-2 px-6 rounded-full" disabled={!selectedShippingAddress}>Next: Payment</button>
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
            <div className="flex justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
              <button onClick={handleNextStep} className="bg-accent text-white py-2 px-6 rounded-full" disabled={!selectedBillingAddress}>Next: Confirmation</button>
            </div>
          </div>
        )}

        {/* Step 4: Order Confirmation */}
        {currentStep === 4 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Order Confirmation</h2>
            <div className="mb-4">
              <h3 className="text-xl font-semibold">Items:</h3>
              {cart.items.map(item => (
                <div key={item.variant_id} className="flex justify-between items-center py-1">
                  <span>{item.name} ({item.size}, {item.color}) x {item.quantity}</span>
                  <span>${(item.price * item.quantity).toFixed(2)}</span>
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
              <p>Subtotal: ${subtotal.toFixed(2)}</p>
              <p>Shipping: ${shippingCost.toFixed(2)}</p>
              <p>Total: ${totalAmount.toFixed(2)}</p>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={handlePrevStep} className="bg-gray-300 text-gray-800 py-2 px-6 rounded-full">Previous</button>
              <button onClick={handlePaymentSuccess} className="bg-green-500 text-white py-2 px-6 rounded-full" disabled={loading}>Place Order</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
