import React, { useState, useEffect } from 'react';
import { useStoreContext } from '../components/StoreProvider';
import ProductCard from '../components/ProductCard';

const Shop = () => {
  const { products, fetchProducts } = useStoreContext();
  const [categories, setCategories] = useState([]); // You might want to fetch these from an API
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    // Fetch categories from products or a dedicated endpoint
    const uniqueCategories = [...new Set(products.map(p => p.category))];
    setCategories(uniqueCategories);
  }, [products]);

  useEffect(() => {
    fetchProducts(selectedCategory);
  }, [selectedCategory, fetchProducts]);

  return (
    <div className="flex px-8 py-16">
      <aside className="w-1/4 pr-8">
        <h2 className="text-2xl font-bold mb-4">Categories</h2>
        <ul>
          <li 
            className={`cursor-pointer ${!selectedCategory ? 'font-bold' : ''}`}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </li>
          {categories.map(category => (
            <li 
              key={category}
              className={`cursor-pointer ${selectedCategory === category ? 'font-bold' : ''}`}
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </li>
          ))}
        </ul>
      </aside>
      <main className="w-3/4">
        <h1 className="text-3xl font-bold text-center">Shop</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
          {products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </main>
    </div>
  );
};

export default Shop;