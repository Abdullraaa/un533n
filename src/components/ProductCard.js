import React from 'react';
import { Link } from 'react-router-dom';

const ProductCard = ({ product }) => {
  // Assuming product.variants is an array and we want to display the first variant's info
  const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0] : null;

  if (!firstVariant) {
    return null; // Or a placeholder if no variants exist
  }

  return (
    <Link to={`/product/${product.id}`}>
      <div className="product-card bg-secondary text-primary rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
        <img src={firstVariant.image_url} alt={product.name} className="w-full h-96 object-cover" />
        <div className="p-4">
          <h3 className="font-bold text-lg mb-1">{product.name}</h3>
          <p className="text-gray-600 text-sm">{product.category}</p>
          <p className="text-primary-dark font-semibold mt-2">${firstVariant.price.toFixed(2)}</p>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;