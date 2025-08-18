import React, { useState, useEffect } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axios from 'axios';
import { useStoreContext } from '../store';

const PaymentForm = ({ totalAmount, onPaymentSuccess, onPaymentError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { token } = useStoreContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded. Make sure to disable form submission until Stripe.js has loaded.
      setLoading(false);
      return;
    }

    const cardElement = elements.getElement(CardElement);

    try {
      // Create Payment Intent on your backend
      const { data: clientSecretData } = await axios.post(
        '/api/payment/create-payment-intent',
        { amount: Math.round(totalAmount * 100), currency: 'usd' }, // Amount in cents
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const clientSecret = clientSecretData.clientSecret;

      // Confirm the card payment
      const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (confirmError) {
        setError(confirmError.message);
        onPaymentError(confirmError.message);
      } else if (paymentIntent.status === 'succeeded') {
        onPaymentSuccess(paymentIntent);
      } else {
        setError('Payment failed or was not successful.');
        onPaymentError('Payment failed or was not successful.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An unexpected error occurred.');
      onPaymentError(err.response?.data?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border p-4 rounded-md">
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <button 
        type="submit" 
        disabled={!stripe || loading}
        className="w-full bg-green-500 text-white py-2 px-4 rounded-md font-bold hover:bg-green-600 transition-colors duration-300"
      >
        {loading ? 'Processing...' : `Pay $${totalAmount.toFixed(2)}`}
      </button>
    </form>
  );
};

export default PaymentForm;
