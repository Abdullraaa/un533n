#!/usr/bin/env node
/**
 * Builds the integration-test database. Run with `pnpm run test:setup`.
 *
 * REQUIRED BEFORE `pnpm test` WILL PASS:
 *   - MySQL/MariaDB reachable at TEST_DB_HOST
 *   - this script run once (re-runnable; it rebuilds from scratch every time)
 *
 * ENVIRONMENT
 *   TEST_DB_NAME      default test_un533n_jest  must match /^test_/ and must
 *                     NOT be test_un533n (the dev database -- the suite issues
 *                     DELETEs, so this guard is not optional)
 *   TEST_DB_HOST      default 127.0.0.1
 *   TEST_DB_USER      default '' (the anonymous local account)
 *   TEST_DB_PASSWORD  default ''
 *
 * The `test_` prefix is load-bearing: MySQL/MariaDB grant the anonymous local
 * account full rights on `test\_%`, so no root or sudo provisioning is needed.
 *
 * WHAT IT DOES
 *   1. DROP + CREATE the database, so every run starts from the same place.
 *   2. Apply un533n_v2.sql.
 *   3. Reverse exactly what migrations/*.sql add, in reverse filename order,
 *      reconstructing the pre-migration baseline.
 *   4. Apply the migrations forward, for real. Errors fatal.
 *   5. Verify the columns and the UNIQUE index landed.
 *
 * Step 3 DERIVES its DROP statements by parsing the migration files -- it never
 * hardcodes them. A hand-written reversal would drift from the migrations the
 * moment either file changed, and the whole point is that the real migration is
 * what gets exercised. A migration statement that is not a recognised
 * ADD COLUMN aborts the run rather than being silently half-reversed.
 *
 * Step 5 is self-verifying on the detail worth checking: if DROP COLUMN did not
 * also remove the implicit UNIQUE index on orders.payment_intent_id, step 4's
 * `ADD COLUMN ... UNIQUE` would fail on a duplicate key name, and errors are
 * fatal. No assumption about implicit-index behaviour is baked in here.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.join(__dirname, '..');
const DB = process.env.TEST_DB_NAME || 'test_un533n_jest';
const HOST = process.env.TEST_DB_HOST || '127.0.0.1';
const USER = process.env.TEST_DB_USER || '';
const PASSWORD = process.env.TEST_DB_PASSWORD || '';

const DEV_DB = 'test_un533n';

function assertSafeName(name) {
  if (!/^test_[A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      `Refusing to use "${name}": the test database name must match /^test_/. ` +
      'That prefix is what grants the anonymous local account rights without sudo.'
    );
  }
  if (name === DEV_DB) {
    throw new Error(
      `Refusing to use "${name}": that is the development database. ` +
      'The suite DELETEs rows in beforeEach and would destroy dev data.'
    );
  }
}

// Split a .sql file into statements. The files here contain no strings with
// semicolons in them, so stripping comments and splitting on ';' is sufficient
// and keeps this dependency-free.
function statements(sql) {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Derive the reversal of a migration from its own text.
 * `ALTER TABLE users ADD COLUMN is_admin BOOLEAN ...` -> `ALTER TABLE users DROP COLUMN is_admin`
 * Anything else in the file is fatal: a future migration must not be silently
 * half-reversed by a parser that quietly skips what it does not recognise.
 */
function deriveDrops(sql, file) {
  return statements(sql).map(stmt => {
    const flat = stmt.replace(/\s+/g, ' ').trim();
    const match = /^ALTER TABLE\s+`?(\w+)`?\s+ADD COLUMN\s+`?(\w+)`?\b/i.exec(flat);
    if (!match) {
      throw new Error(
        `Cannot derive a reversal for a statement in ${file}:\n  ${flat}\n` +
        'Only `ALTER TABLE <table> ADD COLUMN <column> ...` is understood. ' +
        'Teach this script the new form rather than hand-writing the reversal ' +
        'here -- the reversal must stay derived from the migration itself.'
      );
    }
    const [, table, column] = match;
    return { sql: `ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``, table, column };
  });
}

async function main() {
  assertSafeName(DB);

  const migrationFiles = fs
    .readdirSync(path.join(ROOT, 'migrations'))
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error('No migrations found -- expected migrations/*.sql');
  }

  const conn = await mysql.createConnection({
    host: HOST, user: USER, password: PASSWORD, multipleStatements: true
  });

  try {
    console.log(`Building test database \`${DB}\` on ${HOST}\n`);

    await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
    await conn.query(`CREATE DATABASE \`${DB}\``);
    await conn.query(`USE \`${DB}\``);
    console.log(`  [1] dropped and recreated \`${DB}\``);

    const schema = fs.readFileSync(path.join(ROOT, 'un533n_v2.sql'), 'utf8');
    for (const stmt of statements(schema)) {
      await conn.query(stmt);
    }
    console.log('  [2] applied un533n_v2.sql');

    // Reverse in reverse filename order, so the baseline is reconstructed in
    // the opposite sequence to the one the migrations were written in.
    console.log('  [3] reversing what the migrations add, derived from their own text:');
    for (const file of [...migrationFiles].reverse()) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8');
      for (const drop of deriveDrops(sql, file)) {
        await conn.query(drop.sql);
        console.log(`        ${file} -> ${drop.sql}`);
      }
    }

    console.log('  [4] applying the migrations forward (errors fatal):');
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8');
      for (const stmt of statements(sql)) {
        await conn.query(stmt);
      }
      console.log(`        ${file} applied`);
    }

    // Verification. Derived from the migrations too, so it cannot go stale.
    const expected = [];
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(ROOT, 'migrations', file), 'utf8');
      expected.push(...deriveDrops(sql, file));
    }

    for (const { table, column } of expected) {
      const [rows] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [DB, table, column]
      );
      if (rows.length !== 1) {
        throw new Error(`Verification failed: ${table}.${column} is missing after migration`);
      }
    }

    const [idx] = await conn.query(
      `SELECT INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_intent_id'`,
      [DB]
    );
    if (!idx.some(r => Number(r.NON_UNIQUE) === 0)) {
      throw new Error(
        'Verification failed: no UNIQUE index on orders.payment_intent_id. ' +
        'One payment must never be able to produce two orders.'
      );
    }

    console.log(`  [5] verified: ${expected.map(e => `${e.table}.${e.column}`).join(', ')}` +
                ', UNIQUE index on orders.payment_intent_id');
    console.log(`\nDone. \`${DB}\` is ready -- run \`pnpm test\`.`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\ntest-db setup failed:', err.message);
  process.exit(1);
});
