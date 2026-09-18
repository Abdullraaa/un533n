import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStoreContext } from '../components/StoreProvider';
import ProductCard from '../components/ProductCard';

const Home = () => {
  const { products, fetchProducts } = useStoreContext();

  useEffect(() => {
    fetchProducts();
    // fetchProducts is a stable zustand action; depending on `products` here
    // would re-trigger on every store write and loop forever.
  }, [fetchProducts]);

  const list = Array.isArray(products) ? products : [];

  return (
    <div>
      {/* Absolute path: this page also renders under the SPA catch-all, where
          a relative URL would resolve against the current route. */}
      <section className="hero bg-cover bg-center h-screen" style={{ backgroundImage: "url('/imgs/IMG_4420.JPG')" }}>
        <div className="flex items-center justify-center h-full bg-black/50">
          <div className="text-center px-6">
            <h1 className="text-4xl sm:text-5xl font-bold">Fall/Winter Collection</h1>
            <p className="text-xl mt-4">New arrivals are here</p>
            <Link to="/shop" className="mt-8 inline-block bg-accent text-un-black py-2 px-8 rounded-full font-bold">Shop Now</Link>
          </div>
        </div>
      </section>

      <section className="new-arrivals py-16">
        <h2 className="text-3xl font-bold text-center">New Arrivals</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 px-8">
          {list.slice(0, 3).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="sale bg-primary py-16">
        <h2 className="text-3xl font-bold text-center">On Sale</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 px-8">
          {list.slice(3, 6).map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
