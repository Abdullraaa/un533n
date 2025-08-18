import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStoreContext } from '../components/StoreProvider';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { login } = useStoreContext();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/profile'); // Redirect to profile or dashboard after successful login
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="px-8 py-16">
      <h1 className="text-3xl font-bold text-center">Login</h1>
      <div className="max-w-lg mx-auto mt-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
          <div>
            <label htmlFor="email" className="block">Email</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-secondary text-primary border border-gray-700 rounded py-2 px-4" required />
          </div>
          <div>
            <label htmlFor="password" className="block">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-secondary text-primary border border-gray-700 rounded py-2 px-4" required />
          </div>
          <button type="submit" className="bg-accent text-primary py-2 px-8 rounded-full font-bold">Login</button>
        </form>
      </div>
    </div>
  );
};

export default Login;