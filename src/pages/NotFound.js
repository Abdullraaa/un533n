import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="px-8 py-24 text-center">
    <h1 className="text-5xl font-bold text-un-gold">404</h1>
    <p className="mt-4 text-xl">We couldn't find that page.</p>
    <Link
      to="/"
      className="mt-8 inline-block bg-un-gold text-un-black font-bold py-3 px-8 rounded"
    >
      Back home
    </Link>
  </div>
);

export default NotFound;
