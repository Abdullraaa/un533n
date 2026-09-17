const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Without this, mysql2 returns DECIMAL(10,2) columns as strings ("49.99"),
  // and every `price.toFixed(2)` / `total_amount.toFixed(2)` in the UI throws.
  decimalNumbers: true
}).promise();

module.exports = pool;
