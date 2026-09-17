const pool = require('./database');

// Single source of truth for pricing. Both the Stripe charge
// (routes/payment.js) and the recorded order total (routes/orders.js) derive
// from here, so the amount charged always matches the amount stored.
const SHIPPING_COST = 10;
const CURRENCY = 'usd';

// Totals computed from the database, never from the request body.
async function cartTotalForUser(userId) {
  const [rows] = await pool.query(
    `SELECT ci.quantity, pv.price
     FROM carts c
     JOIN cart_items ci ON ci.cart_id = c.id
     JOIN product_variants pv ON ci.variant_id = pv.id
     WHERE c.user_id = ?`,
    [userId]
  );

  const subtotal = rows.reduce((acc, r) => acc + Number(r.price) * r.quantity, 0);
  return {
    itemCount: rows.length,
    subtotal,
    shipping: SHIPPING_COST,
    total: subtotal + SHIPPING_COST
  };
}

// Stripe works in the currency's smallest unit.
const toMinorUnits = (amount) => Math.round(amount * 100);

module.exports = { SHIPPING_COST, CURRENCY, cartTotalForUser, toMinorUnits };
