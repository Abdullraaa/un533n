// Fails fast with an actionable message if the test schema has not been built,
// rather than letting every test die on an ER_NO_SUCH_TABLE.
const mysql = require('mysql2/promise');

const DB = process.env.TEST_DB_NAME || 'test_un533n_jest';
const DEV_DB = 'test_un533n';

module.exports = async () => {
  if (DB === DEV_DB || !/^test_/.test(DB)) {
    throw new Error(`Refusing to run against "${DB}" -- see tests/setup-test-db.js`);
  }

  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.TEST_DB_HOST || '127.0.0.1',
      user: process.env.TEST_DB_USER || '',
      password: process.env.TEST_DB_PASSWORD || '',
      database: DB,
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to the test database \`${DB}\`: ${err.message}\n` +
      'Run `pnpm run test:setup` first.'
    );
  }

  try {
    // The two migrated columns. Without them the suite fails in ways that look
    // like route bugs -- ER_BAD_FIELD_ERROR after the "card" is charged.
    const [cols] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND ((TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin')
           OR (TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_intent_id'))`,
      [DB]
    );
    if (cols.length !== 2) {
      throw new Error(
        `\`${DB}\` is missing migrated columns. Run \`pnpm run test:setup\`.`
      );
    }
  } finally {
    await conn.end();
  }
};
