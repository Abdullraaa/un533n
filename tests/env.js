// Jest `setupFiles`: runs before the test module, and therefore before
// src/server.js calls dotenv.config(). dotenv does not overwrite variables
// already present in process.env, so setting DB_NAME here makes .env's
// DB_NAME=test_un533n (the DEV database) inert.
//
// See tests/setup-test-db.js for the full environment documentation.
process.env.NODE_ENV = 'test';
// dotenv v17 prints a banner on every load; keep the run output to the tests.
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'test_un533n_jest';
process.env.DB_HOST = process.env.TEST_DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.TEST_DB_USER || '';
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || '';

// Pinned rather than taken from .env so the suite signs and verifies tokens
// with a known value regardless of the developer's local config.
process.env.JWT_SECRET = 'test-jwt-secret';
// The stripe module is mocked; this only has to be non-empty.
process.env.STRIPE_SECRET_KEY = 'sk_test_mocked';

if (process.env.DB_NAME === 'test_un533n') {
  throw new Error(
    'Refusing to run the suite against test_un533n -- that is the development ' +
    'database and beforeEach issues DELETEs. Set TEST_DB_NAME to something else.'
  );
}
