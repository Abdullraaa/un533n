const pool = require('./database');

// Single source of truth for pricing. Both the Stripe charge
// (routes/payment.js) and the recorded order total (routes/orders.js) derive
// from here, so the amount charged always matches the amount stored.
const SHIPPING_COST = 10;
const CURRENCY = 'usd';

// Totals computed from the database, never from the request body.
// `outOfStock` lets the caller refuse to charge for a cart that cannot be
// fulfilled -- the only other stock check lives inside the order transaction,
// which runs after the card has already been captured.
async function cartTotalForUser(userId) {
  const [rows] = await pool.query(
    `SELECT ci.quantity, pv.id AS variant_id, pv.price, pv.stock_quantity
     FROM carts c
     JOIN cart_items ci ON ci.cart_id = c.id
     JOIN product_variants pv ON ci.variant_id = pv.id
     WHERE c.user_id = ?`,
    [userId]
  );

  const subtotal = rows.reduce((acc, r) => acc + Number(r.price) * r.quantity, 0);
  const outOfStock = rows
    .filter(r => r.quantity > r.stock_quantity)
    .map(r => ({ variant_id: r.variant_id, requested: r.quantity, available: r.stock_quantity }));

  return {
    itemCount: rows.length,
    subtotal,
    shipping: SHIPPING_COST,
    total: subtotal + SHIPPING_COST,
    outOfStock
  };
}

// Stripe works in the currency's smallest unit.
const toMinorUnits = (amount) => Math.round(amount * 100);

module.exports = { SHIPPING_COST, CURRENCY, cartTotalForUser, toMinorUnits };
