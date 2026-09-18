module.exports = {
  testEnvironment: 'node',
  // Runs before the app (and therefore src/database.js) is required, so the
  // pool is built against the test schema rather than .env's dev one.
  setupFiles: ['<rootDir>/tests/env.js'],
  globalSetup: '<rootDir>/tests/global-setup.js',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Naming every branch in the run output is the point of this suite, so the
  // per-test listing is on by default. `verbose` alone is not enough -- the
  // default reporter has to be named explicitly for it to take effect.
  reporters: ['default'],
  verbose: true,
  // The concurrency tests wait on real InnoDB lock contention.
  testTimeout: 30000,
};
