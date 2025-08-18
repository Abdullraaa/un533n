const express = require('express');
const router = express.Router();
const pool = require('../database');

// Get all products with variants, optionally filtered by category
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let query = `
      SELECT 
        p.id, p.name, p.description, p.category, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'variant_id', pv.id, 
            'sku', pv.sku, 
            'size', pv.size, 
            'color', pv.color, 
            'price', pv.price, 
            'stock_quantity', pv.stock_quantity, 
            'image_url', pv.image_url
          )
        ) AS variants
      FROM products AS p
      LEFT JOIN product_variants AS pv ON p.id = pv.product_id
    `;

    const queryParams = [];
    if (category) {
      query += ' WHERE p.category = ?';
      queryParams.push(category);
    }

    query += ' GROUP BY p.id';

    const [products] = await pool.query(query, queryParams);
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products', error: error.message });
  }
});

// Get a single product by ID with all its variants
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        p.id, p.name, p.description, p.category, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'variant_id', pv.id, 
            'sku', pv.sku, 
            'size', pv.size, 
            'color', pv.color, 
            'price', pv.price, 
            'stock_quantity', pv.stock_quantity, 
            'image_url', pv.image_url
          )
        ) AS variants
      FROM products AS p
      LEFT JOIN product_variants AS pv ON p.id = pv.product_id
      WHERE p.id = ?
      GROUP BY p.id
    `;
    const [rows] = await pool.query(query, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching product', error: error.message });
  }
});

// Create a new product with variants
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { name, description, category, variants } = req.body;

    // Insert the main product
    const [productResult] = await connection.query(
      'INSERT INTO products (name, description, category) VALUES (?, ?, ?)',
      [name, description, category]
    );
    const productId = productResult.insertId;

    // Insert product variants
    if (variants && variants.length > 0) {
      const variantValues = variants.map(v => 
        [productId, v.sku, v.size, v.color, v.price, v.stock_quantity, v.image_url]
      );
      await connection.query(
        'INSERT INTO product_variants (product_id, sku, size, color, price, stock_quantity, image_url) VALUES ?',
        [variantValues]
      );
    }

    await connection.commit();
    res.status(201).json({ message: 'Product created successfully', productId });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Error creating product', error: error.message });
  } finally {
    connection.release();
  }
});

// Update a product and its variants
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { name, description, category, variants } = req.body;

    // Update the main product
    await connection.query(
      'UPDATE products SET name = ?, description = ?, category = ? WHERE id = ?',
      [name, description, category, id]
    );

    // NOTE: This is a simple approach to updating variants.
    // It deletes all existing variants and re-inserts them.
    // For a high-traffic production environment, a more sophisticated merge-update might be better.
    
    // Delete old variants
    await connection.query('DELETE FROM product_variants WHERE product_id = ?', [id]);

    // Insert new variants
    if (variants && variants.length > 0) {
      const variantValues = variants.map(v => 
        [id, v.sku, v.size, v.color, v.price, v.stock_quantity, v.image_url]
      );
      await connection.query(
        'INSERT INTO product_variants (product_id, sku, size, color, price, stock_quantity, image_url) VALUES ?',
        [variantValues]
      );
    }

    await connection.commit();
    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Error updating product', error: error.message });
  } finally {
    connection.release();
  }
});

// Delete a product and all its variants
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    // The ON DELETE CASCADE in the schema will handle deleting related product_variants
    const [result] = await connection.query('DELETE FROM products WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await connection.commit();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ message: 'Error deleting product', error: error.message });
  } finally {
    connection.release();
  }
});

module.exports = router;