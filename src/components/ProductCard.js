import React from 'react';
import { Link } from 'react-router-dom';

const ProductCard = ({ product }) => {
  // LEFT JOIN + JSON_ARRAYAGG gives a product with no variants a single
  // all-null row, so a plain length check isn't enough -- we must confirm
  // the row actually carries a variant.
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const firstVariant = variants.find(v => v && v.variant_id != null) || null;

  if (!firstVariant) {
    return null; // Or a placeholder if no variants exist
  }

  const price = Number(firstVariant.price);

  return (
    <Link to={`/product/${product.id}`}>
      <div className="product-card bg-secondary text-primary rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
        <img src={firstVariant.image_url || '/imgs/csoonpng.png'} alt={product.name} className="w-full h-96 object-cover" />
        <div className="p-4">
          <h3 className="font-bold text-lg mb-1">{product.name}</h3>
          <p className="text-gray-600 text-sm">{product.category}</p>
          <p className="text-primary-dark font-semibold mt-2">
            {Number.isFinite(price) ? `$${price.toFixed(2)}` : 'Price unavailable'}
          </p>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;