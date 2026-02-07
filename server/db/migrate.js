const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./pool');

async function run() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const pool = getPool();

  await pool.query(sql);
  console.log('Database schema applied successfully.');
}

run()
  .catch((error) => {
    console.error('Failed to migrate database:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
