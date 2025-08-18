
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import ProductCard from '../components/ProductCard';

const Home = () => {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.getProducts().then(setProducts);
  }, []);

  return (
    <div>
      <section className="hero bg-cover bg-center h-screen" style={{ backgroundImage: "url('imgs/IMG_4420.JPG')" }}>
        <div className="flex items-center justify-center h-full bg-black bg-opacity-50">
          <div className="text-center">
            <h1 className="text-5xl font-bold">Fall/Winter Collection</h1>
            <p className="text-xl mt-4">New arrivals are here</p>
            <a href="/shop" className="mt-8 inline-block bg-accent text-primary py-2 px-8 rounded-full font-bold">Shop Now</a>
          </div>
        </div>
      </section>

      <section className="new-arrivals py-16">
        <h2 className="text-3xl font-bold text-center">New Arrivals</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 px-8">
          {products.slice(0, 3).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="sale bg-primary py-16">
        <h2 className="text-3xl font-bold text-center">On Sale</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 px-8">
          {products.slice(3, 6).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
