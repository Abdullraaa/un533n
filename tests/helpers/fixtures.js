// Minimal fixtures scoped to the payment / order-creation tests. Deliberately
// NOT seed.sql -- that loads the whole dev catalogue and is destructive.
const jwt = require('jsonwebtoken');
const pool = require('../../src/database');
const { SHIPPING_COST } = require('../../src/pricing');

const PLENTY_PRICE = 25.0;
const PLENTY_STOCK = 50;
const SCARCE_PRICE = 40.0;
const SCARCE_STOCK = 1; // the last-unit race depends on this being exactly 1

const fx = {
  userA: null,
  userB: null,
  productId: null,
  variantPlenty: null,
  variantScarce: null,
};

async function findOrCreateUser(email) {
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return existing[0].id;
  // These tests never log in through the API, so the password is a literal
  // rather than a bcrypt hash -- auth is exercised with signed JWTs instead.
  const [res] = await pool.query(
    'INSERT INTO users (email, password, first_name, last_name) VALUES (?, ?, ?, ?)',
    [email, 'not-a-real-hash', 'Test', 'User']
  );
  return res.insertId;
}

async function findOrCreateVariant(productId, sku, price, stock) {
  const [existing] = await pool.query('SELECT id FROM product_variants WHERE sku = ?', [sku]);
  if (existing.length) return existing[0].id;
  const [res] = await pool.query(
    `INSERT INTO product_variants (product_id, sku, size, color, price, stock_quantity, image_url)
     VALUES (?, ?, 'M', 'black', ?, ?, '/imgs/test.jpg')`,
    [productId, sku, price, stock]
  );
  return res.insertId;
}

// Created once per test file. Users, product and variants outlive the
// per-test reset; everything transactional is rebuilt in reset().
async function seedOnce() {
  const [prod] = await pool.query(
    "SELECT id FROM products WHERE name = 'Fixture Tee' LIMIT 1"
  );
  fx.productId = prod.length
    ? prod[0].id
    : (await pool.query(
        "INSERT INTO products (name, description, category) VALUES ('Fixture Tee', 'test fixture', 'tops')"
      ))[0].insertId;

  fx.variantPlenty = {
    id: await findOrCreateVariant(fx.productId, 'FIXTURE-PLENTY', PLENTY_PRICE, PLENTY_STOCK),
    price: PLENTY_PRICE,
    stock: PLENTY_STOCK,
  };
  fx.variantScarce = {
    id: await findOrCreateVariant(fx.productId, 'FIXTURE-SCARCE', SCARCE_PRICE, SCARCE_STOCK),
    price: SCARCE_PRICE,
    stock: SCARCE_STOCK,
  };

  for (const key of ['userA', 'userB']) {
    const email = `${key.toLowerCase()}@fixture.test`;
    const id = await findOrCreateUser(email);
    fx[key] = { id, email, token: tokenFor(id) };
  }

  return fx;
}

// Deletes in FK-safe order: orders references addresses, so orders must go
// first. Then rebuilds addresses and carts, whose ids change every run.
async function reset() {
  await pool.query('DELETE FROM order_items');
  await pool.query('DELETE FROM orders');
  await pool.query('DELETE FROM cart_items');
  await pool.query('DELETE FROM carts');
  await pool.query('DELETE FROM wishlists');
  await pool.query('DELETE FROM addresses');

  await pool.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?',
    [PLENTY_STOCK, fx.variantPlenty.id]);
  await pool.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?',
    [SCARCE_STOCK, fx.variantScarce.id]);

  for (const key of ['userA', 'userB']) {
    const user = fx[key];
    const [ship] = await pool.query(
      `INSERT INTO addresses (user_id, address_line1, city, state, postal_code, country, address_type)
       VALUES (?, '1 Test Street', 'Testville', 'TS', '00001', 'US', 'shipping')`,
      [user.id]
    );
    const [bill] = await pool.query(
      `INSERT INTO addresses (user_id, address_line1, city, state, postal_code, country, address_type)
       VALUES (?, '2 Test Street', 'Testville', 'TS', '00002', 'US', 'billing')`,
      [user.id]
    );
    const [cart] = await pool.query('INSERT INTO carts (user_id) VALUES (?)', [user.id]);

    user.shippingAddressId = ship.insertId;
    user.billingAddressId = bill.insertId;
    user.cartId = cart.insertId;
  }
}

function tokenFor(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
}

async function addToCart(cartId, variantId, quantity) {
  await pool.query(
    'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)',
    [cartId, variantId, quantity]
  );
}

async function setStock(variantId, quantity) {
  await pool.query('UPDATE product_variants SET stock_quantity = ? WHERE id = ?',
    [quantity, variantId]);
}

async function stockOf(variantId) {
  const [[row]] = await pool.query(
    'SELECT stock_quantity FROM product_variants WHERE id = ?', [variantId]
  );
  return row.stock_quantity;
}

async function orderRows() {
  const [rows] = await pool.query('SELECT * FROM orders ORDER BY id');
  return rows;
}

async function cartItemCount(cartId) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS n FROM cart_items WHERE cart_id = ?', [cartId]
  );
  return row.n;
}

// Mirrors the server's own arithmetic: line items plus flat shipping.
function expectedTotal(lines) {
  return lines.reduce((acc, l) => acc + l.price * l.quantity, 0) + SHIPPING_COST;
}

module.exports = {
  fx, seedOnce, reset, tokenFor, addToCart, setStock, stockOf,
  orderRows, cartItemCount, expectedTotal,
  PLENTY_PRICE, PLENTY_STOCK, SCARCE_PRICE, SCARCE_STOCK,
};
