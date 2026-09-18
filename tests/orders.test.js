/**
 * Integration tests for POST /api/orders -- the endpoint that turns a captured
 * payment into an order. Built from a full enumeration of the handler's
 * response branches, not from what seemed important: the self-refund bug
 * shipped because replay of a *successful* payment was never on anybody's list.
 *
 * REQUIRED BEFORE `pnpm test` WILL PASS
 *   - MySQL/MariaDB reachable, and `pnpm run test:setup` run once. That script
 *     creates the schema, reconstructs the pre-migration baseline, and applies
 *     migrations/001 and 002 for real.
 *   - Env: TEST_DB_NAME (default test_un533n_jest -- must match /^test_/ and
 *     must not be the dev database test_un533n), TEST_DB_HOST (127.0.0.1),
 *     TEST_DB_USER (''), TEST_DB_PASSWORD ('').
 *   See tests/setup-test-db.js for the authoritative documentation.
 *
 * Stripe is mocked; no network call is made and no real money is involved.
 */

const mockStripe = require('./helpers/stripe-mock');
jest.mock('stripe', () => {
  const mock = require('./helpers/stripe-mock');
  return jest.fn(() => mock);
});

const request = require('supertest');
const app = require('../src/server');
const pool = require('../src/database');
const { CURRENCY, SHIPPING_COST, toMinorUnits } = require('../src/pricing');
const f = require('./helpers/fixtures');
const { fx } = f;

const ORDER_LOOKUP_SQL = /SELECT id FROM orders WHERE payment_intent_id/;

let intentSeq = 0;
const nextIntentId = () => `pi_test_${Date.now()}_${intentSeq++}`;

function succeededIntent({ id, userId, amount, currency = CURRENCY }) {
  return { id, status: 'succeeded', amount, currency, metadata: { user_id: String(userId) } };
}

function dbError(code = 'ER_CON_COUNT_ERROR') {
  return Object.assign(new Error('simulated database failure'), { code });
}

/**
 * Intercept pool.query calls whose SQL matches `match` (and, when given, whose
 * bound parameters match too), passing everything else through to the real
 * pool. `handler` decides what the intercepted call does.
 *
 * `limit` caps how many matching calls are intercepted. Note that the
 * pre-check at orders.js:80 and the re-check inside refundAndRespond issue
 * textually identical SQL with identical parameters, so they cannot be told
 * apart by matching alone -- but they are ordered by control flow: the
 * re-check only ever runs *after* the pre-check has already returned or
 * thrown. So "the first matching call in a request" is the pre-check, always,
 * by construction rather than by timing. The tests that rely on this also
 * assert an outcome only reachable if the second call ran for real.
 */
function interceptPoolQuery({ match, params, limit = 1, handler }) {
  const real = pool.query.bind(pool);
  const matched = [];
  jest.spyOn(pool, 'query').mockImplementation((sql, args) => {
    const hit =
      typeof sql === 'string' &&
      match.test(sql) &&
      (params === undefined || JSON.stringify(args) === JSON.stringify(params));
    if (!hit) return real(sql, args);
    matched.push(args);
    if (matched.length > limit) return real(sql, args);
    return handler(sql, args, matched.length);
  });
  return { matchedCalls: () => matched };
}

// A connection stub, so the branches that can only be reached by a failure
// inside the transaction are deterministic instead of raced.
function stubConnection(error) {
  const conn = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockRejectedValue(error),
    rollback: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
  };
  jest.spyOn(pool, 'getConnection').mockResolvedValue(conn);
  return conn;
}

async function seedOrder({ user, intentId, total = 99.99 }) {
  const [res] = await pool.query(
    `INSERT INTO orders (user_id, total_amount, shipping_address_id, billing_address_id, payment_intent_id)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, total, user.shippingAddressId, user.billingAddressId, intentId]
  );
  return res.insertId;
}

function postOrder(user, body) {
  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${user.token}`)
    .send(body);
}

function validBody(user, intentId) {
  return {
    shipping_address_id: user.shippingAddressId,
    billing_address_id: user.billingAddressId,
    payment_intent_id: intentId,
  };
}

const expectRefundFor = id =>
  expect(mockStripe.refunds.create).toHaveBeenCalledWith(
    { payment_intent: id },
    { idempotencyKey: `refund:${id}` }
  );

beforeAll(async () => {
  await f.seedOnce();
});

beforeEach(async () => {
  await f.reset();
  jest.clearAllMocks();
  mockStripe.refunds.create.mockResolvedValue({ id: 're_test' });
  // These branches log deliberately; keep the suite output readable.
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
describe('happy path (branch 16)', () => {
  it('creates the order, decrements stock, clears the cart, refunds nothing', async () => {
    const intentId = nextIntentId();
    const user = fx.userA;
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) })
    );

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(201);
    expect(res.body.orderId).toEqual(expect.any(Number));
    expect(res.body.payment_intent_id).toBe(intentId);

    const orders = await f.orderRows();
    expect(orders).toHaveLength(1);
    expect(orders[0].total_amount).toBe(total);
    expect(orders[0].payment_intent_id).toBe(intentId);

    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [orders[0].id]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].price).toBe(f.PLENTY_PRICE);

    expect(await f.stockOf(fx.variantPlenty.id)).toBe(f.PLENTY_STOCK - 2);
    expect(await f.cartItemCount(user.cartId)).toBe(0);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('pre-capture rejections (branches 1-5): never refund', () => {
  it('branch 1: missing address ids -> 400', async () => {
    const res = await postOrder(fx.userA, { payment_intent_id: nextIntentId() });
    expect(res.status).toBe(400);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 2: missing payment_intent_id -> 400', async () => {
    const user = fx.userA;
    const res = await postOrder(user, {
      shipping_address_id: user.shippingAddressId,
      billing_address_id: user.billingAddressId,
    });
    expect(res.status).toBe(400);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 3: paymentIntents.retrieve throws -> 402', async () => {
    const intentId = nextIntentId();
    mockStripe.paymentIntents.retrieve.mockRejectedValue(new Error('no such payment_intent'));

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(402);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 4: intent has not succeeded -> 402, nothing was captured', async () => {
    const intentId = nextIntentId();
    mockStripe.paymentIntents.retrieve.mockResolvedValue({
      id: intentId, status: 'requires_payment_method', amount: 3500,
      currency: CURRENCY, metadata: { user_id: String(fx.userA.id) },
    });

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(402);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 5: payment belongs to another account -> 403 and NO refund', async () => {
    // Refunding here would be refunding a stranger's real, successful payment.
    const intentId = nextIntentId();
    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: fx.userB.id, amount: 3500 })
    );

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(403);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('branch 6: replaying a spent payment', () => {
  /**
   * THE ONE THAT MATTERS MOST.
   *
   * This is the bug that shipped and was caught by luck (fixed in de2b2c4).
   * A customer places a valid order, changes their cart so the amount no longer
   * matches, and resubmits the same payment_intent_id. If the spent-intent
   * check is ever moved below the refund paths, the amount-mismatch branch
   * refunds them -- and they keep the goods AND the money.
   *
   * If this test fails, that bug is back. Do not weaken it, do not delete it,
   * and do not "fix" it by relaxing the zero-refund assertion.
   */
  it('refuses a replay with a mismatched cart: 409, ZERO refunds, original order intact', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) })
    );

    const first = await postOrder(user, validBody(user, intentId));
    expect(first.status).toBe(201);
    const originalOrder = (await f.orderRows())[0];

    // The cart now disagrees with what was paid.
    await f.addToCart(user.cartId, fx.variantPlenty.id, 3);

    const replay = await postOrder(user, validBody(user, intentId));

    expect(replay.status).toBe(409);
    expect(replay.body.orderId).toBe(originalOrder.id);
    expect(replay.body.refunded).toBeUndefined();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();

    const after = await f.orderRows();
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(originalOrder);
  });

  it('echoes the existing order id on a plain replay', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    const existingId = await seedOrder({ user, intentId });

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: 3500 })
    );

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(409);
    expect(res.body.orderId).toBe(existingId);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('branch 6b: the pre-check query itself fails', () => {
  it('answers 503 and refunds instead of killing the process', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: 3500 })
    );
    interceptPoolQuery({
      match: ORDER_LOOKUP_SQL,
      params: [intentId],
      limit: 1,
      handler: () => Promise.reject(dbError()),
    });

    const res = await postOrder(user, validBody(user, intentId));

    // Resolving at all is half the point: unguarded, this rejection is
    // unhandled in an Express 4 async handler and Node terminates the process.
    expect(res.status).toBe(503);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('branch 7: the pool cannot hand out a connection', () => {
  it('answers 503 and refunds rather than hanging', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 1);

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: 3500 })
    );
    jest.spyOn(pool, 'getConnection').mockRejectedValue(dbError());

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(503);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('post-capture rejections: refund, then answer', () => {
  async function arrange({ user = fx.userA, quantity = 2, amount, currency } = {}) {
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, quantity);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity }]);
    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({
        id: intentId, userId: user.id,
        amount: amount === undefined ? toMinorUnits(total) : amount,
        currency,
      })
    );
    return { intentId, total };
  }

  it("branch 8: another user's address -> 404, refunded", async () => {
    const { intentId } = await arrange();
    const res = await postOrder(fx.userA, {
      shipping_address_id: fx.userB.shippingAddressId,
      billing_address_id: fx.userB.billingAddressId,
      payment_intent_id: intentId,
    });

    expect(res.status).toBe(404);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 8: only one of the two ids is foreign -> 404, refunded', async () => {
    const { intentId } = await arrange();
    const res = await postOrder(fx.userA, {
      shipping_address_id: fx.userA.shippingAddressId,
      billing_address_id: fx.userB.billingAddressId,
      payment_intent_id: intentId,
    });

    expect(res.status).toBe(404);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 8: nonexistent address id -> 404, refunded', async () => {
    const { intentId } = await arrange();
    const res = await postOrder(fx.userA, {
      shipping_address_id: 99999999,
      billing_address_id: fx.userA.billingAddressId,
      payment_intent_id: intentId,
    });

    expect(res.status).toBe(404);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 9: no cart row -> 400, refunded', async () => {
    const { intentId } = await arrange();
    await pool.query('DELETE FROM carts WHERE user_id = ?', [fx.userA.id]);

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(400);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 10: cart is empty -> 400, refunded', async () => {
    const { intentId } = await arrange();
    await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [fx.userA.cartId]);

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(400);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 11: cart exceeds stock -> 409, refunded', async () => {
    const { intentId } = await arrange({ quantity: 5 });
    await f.setStock(fx.variantPlenty.id, 1);

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(409);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
    expect(await f.stockOf(fx.variantPlenty.id)).toBe(1);
  });

  it('branch 12: currency mismatch -> 409, refunded', async () => {
    const { intentId } = await arrange({ currency: 'eur' });

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(409);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 13: amount mismatch -> 409, refunded, reports paid vs expected', async () => {
    const { intentId, total } = await arrange({ amount: 1 });

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(409);
    expect(res.body.refunded).toBe(true);
    expect(res.body.paid).toBe(1);
    expect(res.body.expected).toBe(toMinorUnits(total));
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 17: lock contention -> 409, refunded, no raw DB string', async () => {
    const { intentId } = await arrange();
    stubConnection(dbError('ER_LOCK_DEADLOCK'));

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(409);
    expect(res.body.refunded).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/ER_LOCK_DEADLOCK/);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('branch 18: unexpected failure -> 500, refunded', async () => {
    const { intentId } = await arrange();
    stubConnection(dbError('ER_SOMETHING_ELSE'));

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(500);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });

  it('refunds.create itself throws -> 502, refunded:false, intent id in the body', async () => {
    const { intentId } = await arrange({ amount: 1 });
    mockStripe.refunds.create.mockRejectedValue(new Error('charge_already_refunded'));

    const res = await postOrder(fx.userA, validBody(fx.userA, intentId));

    expect(res.status).toBe(502);
    expect(res.body.refunded).toBe(false);
    expect(res.body.payment_intent_id).toBe(intentId);
    expect(await f.orderRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('branch 14: the UNIQUE index backstop', () => {
  it('catches ER_DUP_ENTRY when the pre-check is bypassed: 409, no refund', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);
    const existingId = await seedOrder({ user, intentId, total });

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) })
    );
    // Force the pre-check to miss, so the request runs all the way to the
    // INSERT and the UNIQUE index is what stops it.
    interceptPoolQuery({
      match: ORDER_LOOKUP_SQL, params: [intentId], limit: 1,
      handler: () => Promise.resolve([[], []]),
    });

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(409);
    expect(res.body.orderId).toBe(existingId);
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    expect(await f.orderRows()).toHaveLength(1);
    expect(await f.stockOf(fx.variantPlenty.id)).toBe(f.PLENTY_STOCK);
  });

  for (let run = 1; run <= 5; run++) {
    it(`concurrent double-submit of one fresh intent produces one order (run ${run}/5)`, async () => {
      const user = fx.userA;
      const intentId = nextIntentId();
      await f.addToCart(user.cartId, fx.variantPlenty.id, 1);
      const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 1 }]);

      mockStripe.paymentIntents.retrieve.mockResolvedValue(
        succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) })
      );

      const [a, b] = await Promise.all([
        postOrder(user, validBody(user, intentId)),
        postOrder(user, validBody(user, intentId)),
      ]);

      const orders = await f.orderRows();
      expect(orders).toHaveLength(1);

      const ids = [a.body.orderId, b.body.orderId];
      expect(ids).toEqual([orders[0].id, orders[0].id]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      // Whichever path the loser took -- the pre-check or the UNIQUE index --
      // the money is correctly tied to the order named in both responses.
      expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
describe('the spent-intent re-check inside refundAndRespond', () => {
  /**
   * The handler's pre-check runs before the transaction opens, so a concurrent
   * request can commit an order for this intent in between -- and every branch
   * below that point refunds. Simulated deterministically here (pre-check
   * forced to miss + the failing condition arranged) rather than raced: the
   * real window is a few milliseconds wide and will not reproduce reliably.
   *
   * Each case proves the guard covers that specific refunding branch, not just
   * the one it happened to be written against.
   */
  async function replayInto(arrangeFailure) {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);
    const existingId = await seedOrder({ user, intentId, total });

    const intent = succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) });
    await arrangeFailure({ user, intent });
    mockStripe.paymentIntents.retrieve.mockResolvedValue(intent);

    // Miss once. The re-check that follows runs for real against the database
    // -- a 409 naming the existing order is only reachable if it did.
    interceptPoolQuery({
      match: ORDER_LOOKUP_SQL, params: [intentId], limit: 1,
      handler: () => Promise.resolve([[], []]),
    });

    const res = await postOrder(user, validBody(user, intentId));
    return { res, existingId, intentId };
  }

  async function expectNoRefund({ res, existingId }) {
    expect(res.status).toBe(409);
    expect(res.body.orderId).toBe(existingId);
    expect(res.body.refunded).toBeUndefined();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    const orders = await f.orderRows();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(existingId);
  }

  it('branch 9 (no cart) would refund a paid order -- guard stops it', async () => {
    const out = await replayInto(async ({ user }) => {
      await pool.query('DELETE FROM carts WHERE user_id = ?', [user.id]);
    });
    await expectNoRefund(out);
  });

  it('branch 10 (empty cart) would refund a paid order -- guard stops it', async () => {
    const out = await replayInto(async ({ user }) => {
      await pool.query('DELETE FROM cart_items WHERE cart_id = ?', [user.cartId]);
    });
    await expectNoRefund(out);
  });

  it('branch 11 (stock shortfall) would refund a paid order -- guard stops it', async () => {
    const out = await replayInto(async () => {
      await f.setStock(fx.variantPlenty.id, 1);
    });
    await expectNoRefund(out);
  });

  it('branch 12 (currency mismatch) would refund a paid order -- guard stops it', async () => {
    const out = await replayInto(async ({ intent }) => { intent.currency = 'eur'; });
    await expectNoRefund(out);
  });

  it('branch 13 (amount mismatch) would refund a paid order -- guard stops it', async () => {
    const out = await replayInto(async ({ intent }) => { intent.amount = 1; });
    await expectNoRefund(out);
  });

  it('falls through and refunds when the re-check query itself fails', async () => {
    // Both lookups fail: a compounding DB fault. The guard cannot tell whether
    // the intent is spent, so it refunds rather than stranding the money, and
    // -- critically -- does not throw out of an unguarded await.
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: 1 })
    );
    // The pre-check returns empty so the request proceeds to the amount
    // mismatch; the re-check that follows rejects.
    const spy = interceptPoolQuery({
      match: ORDER_LOOKUP_SQL, params: [intentId], limit: 2,
      handler: (sql, args, nth) =>
        nth === 1 ? Promise.resolve([[], []]) : Promise.reject(dbError()),
    });

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(409);
    expect(res.body.refunded).toBe(true);
    expectRefundFor(intentId);
    expect(spy.matchedCalls()).toHaveLength(2);
    expect(await f.orderRows()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('Fix 1 x the re-check: a failing pre-check on an already-spent intent', () => {
  /**
   * The scenario that decides whether failing open at orders.js:80 is safe.
   * Branch 6b covers "pre-check throws" with NO existing order (-> 503,
   * refunded). The re-check tests above reach the guard through a simulated
   * race miss, not through the pre-check's exception path. Neither proves the
   * combination, and the combination is the dangerous one: a genuine replay of
   * an already-spent intent where the pre-check happens to throw.
   *
   * Expect 409, NOT the 503 of branch 6b -- the differing status is what shows
   * this is a distinct path rather than a restatement of it.
   */
  it('answers 409 naming the existing order and refunds nothing', async () => {
    const user = fx.userA;
    const intentId = nextIntentId();
    await f.addToCart(user.cartId, fx.variantPlenty.id, 2);
    const total = f.expectedTotal([{ price: f.PLENTY_PRICE, quantity: 2 }]);
    const existingId = await seedOrder({ user, intentId, total });

    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      succeededIntent({ id: intentId, userId: user.id, amount: toMinorUnits(total) })
    );

    // Only the pre-check fails. The re-check inside refundAndRespond runs for
    // real and finds the order -- which is the whole point.
    const spy = interceptPoolQuery({
      match: ORDER_LOOKUP_SQL, params: [intentId], limit: 1,
      handler: () => Promise.reject(dbError()),
    });

    const res = await postOrder(user, validBody(user, intentId));

    expect(res.status).toBe(409);
    expect(res.status).not.toBe(503);
    expect(res.body.orderId).toBe(existingId);
    expect(res.body.refunded).toBeUndefined();
    expect(mockStripe.refunds.create).not.toHaveBeenCalled();

    // Both lookups were issued: the one that failed, and the one that saved us.
    expect(spy.matchedCalls()).toHaveLength(2);

    const orders = await f.orderRows();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(existingId);
    expect(orders[0].total_amount).toBe(total);
  });
});

// ---------------------------------------------------------------------------
describe('two checkouts for the last unit in stock', () => {
  // Real DB-level contention. Run five times: one green run does not show it
  // is not flaky.
  for (let run = 1; run <= 5; run++) {
    it(`one succeeds, one is rejected, stock lands on 0 (run ${run}/5)`, async () => {
      const intentA = nextIntentId();
      const intentB = nextIntentId();
      await f.setStock(fx.variantScarce.id, 1);
      await f.addToCart(fx.userA.cartId, fx.variantScarce.id, 1);
      await f.addToCart(fx.userB.cartId, fx.variantScarce.id, 1);
      const total = f.expectedTotal([{ price: f.SCARCE_PRICE, quantity: 1 }]);

      mockStripe.paymentIntents.retrieve.mockImplementation(async id =>
        succeededIntent({
          id,
          userId: id === intentA ? fx.userA.id : fx.userB.id,
          amount: toMinorUnits(total),
        })
      );

      const [a, b] = await Promise.all([
        postOrder(fx.userA, validBody(fx.userA, intentA)),
        postOrder(fx.userB, validBody(fx.userB, intentB)),
      ]);

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      // The invariant that matters: signed INT stock must never go negative.
      expect(await f.stockOf(fx.variantScarce.id)).toBe(0);
      expect(await f.orderRows()).toHaveLength(1);
      // The loser may land on branch 11, 15 or 17 depending on interleaving --
      // all three are 409 and all three refund exactly once.
      expect(mockStripe.refunds.create).toHaveBeenCalledTimes(1);
    });
  }
});
