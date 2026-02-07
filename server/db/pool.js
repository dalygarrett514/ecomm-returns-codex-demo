const { Pool } = require('pg');
const config = require('../config');

let pool;

function getPool() {
  if (!config.db.connectionString) {
    throw new Error('DATABASE_URL is required to use PostgreSQL-backed features.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.db.connectionString
    });
  }

  return pool;
}

async function query(text, params = []) {
  const db = getPool();
  return db.query(text, params);
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  getPool,
  query,
  closePool
};
