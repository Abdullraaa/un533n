import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStoreContext } from '../components/StoreProvider';

const ProductDetail = () => {
  const { id } = useParams();
  const { products, fetchProducts, addToCart } = useStoreContext();
  const [product, setProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    // Fetch all products if not already fetched (or fetch single product if API supports it)
    if (products.length === 0) {
      fetchProducts();
    }
  }, [products, fetchProducts]);

  useEffect(() => {
    // Find the product from the store's products array
    const foundProduct = products.find(p => p.id === parseInt(id));
    setProduct(foundProduct);

    // Set initial selected variant if product is found
    if (foundProduct && foundProduct.variants && foundProduct.variants.length > 0) {
      setSelectedSize(foundProduct.variants[0].size || '');
      setSelectedColor(foundProduct.variants[0].color || '');
      setSelectedVariant(foundProduct.variants[0]);
    }
  }, [id, products]);

  useEffect(() => {
    if (product && product.variants) {
      const variant = product.variants.find(v => 
        (v.size === selectedSize || !selectedSize) && 
        (v.color === selectedColor || !selectedColor)
      );
      setSelectedVariant(variant);
    }
  }, [selectedSize, selectedColor, product]);

  const handleAddToCart = () => {
    if (selectedVariant && quantity > 0) {
      addToCart(selectedVariant.variant_id, quantity);
      alert(`${quantity} of ${product.name} (${selectedVariant.size}, ${selectedVariant.color}) added to cart!`);
    } else {
      alert('Please select a size and color, and a valid quantity.');
    }
  };

  if (!product) {
    return <div>Loading product details...</div>;
  }

  const availableSizes = [...new Set(product.variants.map(v => v.size))].filter(Boolean);
  const availableColors = [...new Set(product.variants.map(v => v.color))].filter(Boolean);

  return (
    <div className="px-8 py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 max-w-6xl mx-auto">
        <div>
          <img src={selectedVariant?.image_url || product.variants[0]?.image_url} alt={product.name} className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <p className="text-2xl text-gray-400 mt-2">${selectedVariant?.price.toFixed(2) || product.variants[0]?.price.toFixed(2)}</p>
          <p className="mt-4">{product.description}</p>
          
          {availableSizes.length > 0 && (
            <div className="mt-8">
              <label htmlFor="size" className="block text-lg font-medium text-gray-700">Size</label>
              <select 
                id="size" 
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
              >
                <option value="">Select a size</option>
                {availableSizes.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          )}

          {availableColors.length > 0 && (
            <div className="mt-4">
              <label htmlFor="color" className="block text-lg font-medium text-gray-700">Color</label>
              <select 
                id="color" 
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
              >
                <option value="">Select a color</option>
                {availableColors.map(color => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4">
            <label htmlFor="quantity" className="block text-lg font-medium text-gray-700">Quantity</label>
            <input 
              type="number" 
              id="quantity" 
              min="1" 
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="mt-1 block w-24 pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            />
          </div>

          <div className="mt-8">
            <button 
              onClick={handleAddToCart}
              className="w-full bg-accent text-white py-3 px-8 rounded-full font-bold text-lg hover:bg-accent-dark transition-colors duration-300"
              disabled={!selectedVariant || selectedVariant.stock_quantity === 0}
            >
              {selectedVariant && selectedVariant.stock_quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
          </div>
          {selectedVariant && selectedVariant.stock_quantity > 0 && (
            <p className="text-sm text-gray-500 mt-2">In Stock: {selectedVariant.stock_quantity}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;