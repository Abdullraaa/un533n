/**
 * Integration tests for POST /api/payment/create-payment-intent -- the
 * endpoint that decides how much the customer is charged.
 *
 * Two properties carry the weight here: the amount is computed server-side and
 * cannot be influenced by the request body, and everything that can make an
 * order impossible is checked BEFORE the card is touched.
 *
 * Prerequisites and environment: see tests/orders.test.js and
 * tests/setup-test-db.js. Stripe is mocked; no network call is made.
 */

const mockStripe = require('./helpers/stripe-mock');
jest.mock('stripe', () => {
  const mock = require('./helpers/stripe-mock');
  return jest.fn(() => mock);
});

const request = require('supertest');
const app = require('../src/server');
const pool = require('../src/database');
const { CURRENCY, toMinorUnits } = require('../src/pricing');
const f = require('./helpers/fixtures');
const { fx } = f;

function createIntent(user, body) {
  return request(app)
    .post('/api/payment/create-payment-intent')
    .set('Authorization', `Bearer ${user.token}`)
    .send(body);
}

const addresses = user => ({
  shipping_address_id: user.shippingAddressId,
  billing_address_id: user.billingAddressId,
});

beforeAll(async () => {
  await f.seedOnce();
});

beforeEach(async () => {
  await f.reset();
  jest.clearAllMocks();
  mockStripe.paymentIntents.create.mockResolvedValue({
    id: 'pi_created', client_secret: 'cs_test_secret',
  });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('the charge is priced from the database (branch 5)', () => {
  it('uses the server-computed cart total and currency', async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);

    const res = await createIntent(user, addresses(user));

    expect(res.status).toBe(200);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: toMinorUnits(total), currency: CURRENCY })
    );
    expect(res.body.total).toBe(total);
    expect(res.body.subtotal).toBe(f.PLENTY_PRICE * 2);
    expect(res.body.clientSecret).toBe('cs_test_secret');
  });

  it('IGNORES an amount supplied in the request body', async () => {
    // Regression guard: a client-supplied amount once let a caller name its
    // own price for any cart.
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);

    const res = await createIntent(user, {
      ...addresses(user),
      amount: 1,
      currency: 'eur',
      total: 1,
      subtotal: 1,
    });

    expect(res.status).toBe(200);
    const [args] = mockStripe.paymentIntents.create.mock.calls[0];
    expect(args.amount).toBe(toMinorUnits(total));
    expect(args.amount).not.toBe(1);
    expect(args.currency).toBe(CURRENCY);
    expect(res.body.total).toBe(total);
  });

  it('stamps metadata.user_id with the caller', async () => {
    // routes/orders.js branch 5 rejects on exactly this field, so it is
    // asserted directly rather than left implied.
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    await createIntent(user, addresses(user));

    const [args] = mockStripe.paymentIntents.create.mock.calls[0];
    expect(args.metadata).toEqual({ user_id: String(user.id) });
    expect(typeof args.metadata.user_id).toBe('string');
  });
});

describe('everything that can fail is checked before the card is touched', () => {
  it('branch 1: missing address ids -> 400, Stripe never called', async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    const res = await createIntent(user, {});

    expect(res.status).toBe(400);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("branch 2: another user's address -> 404, Stripe never called", async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    const res = await createIntent(user, addresses(fx.userB));

    expect(res.status).toBe(404);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('branch 2: nonexistent address -> 404, Stripe never called', async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    const res = await createIntent(user, {
      shipping_address_id: 99999999,
      billing_address_id: user.billingAddressId,
    });

    expect(res.status).toBe(404);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('branch 3: empty cart -> 400, Stripe never called', async () => {
    const user = fx.userA;

    const res = await createIntent(user, addresses(user));

    expect(res.status).toBe(400);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('branch 4: cart exceeds stock -> 409 naming the variant, Stripe never called', async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantScarce.id, 3);
    await f.setStock(fx.variantScarce.id, 1);

    const res = await createIntent(user, addresses(user));

    expect(res.status).toBe(409);
    expect(res.body.outOfStock).toEqual([
      { variant_id: fx.variantScarce.id, requested: 3, available: 1 },
    ]);
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
  });
});

describe('branch 6: Stripe itself fails', () => {
  it('returns 500 rather than a half-finished success', async () => {
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);
    mockStripe.paymentIntents.create.mockRejectedValue(new Error('stripe is down'));

    const res = await createIntent(user, addresses(user));

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/payment intent/i);
  });
});

describe('the two endpoints agree on the price', () => {
  it('the intent amount equals what orders.js will recompute for the same cart', async () => {
    // pricing.js is shared for the shipping figure, but orders.js recomputes
    // the item subtotal itself. This asserts the two land on the same number.
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 3);
    await f.addToCart(user.cartId, fx.variantScarce.id, 1);

    await createIntent(user, addresses(user));
    const [args] = mockStripe.paymentIntents.create.mock.calls[0];

    const [rows] = await pool.query(
      `SELECT ci.quantity, pv.price
       FROM cart_items ci JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.cart_id = ?`,
      [user.cartId]
    );
    const ordersSideTotal = f.expectedTotal(rows);

    expect(args.amount).toBe(toMinorUnits(ordersSideTotal));
  });
});
