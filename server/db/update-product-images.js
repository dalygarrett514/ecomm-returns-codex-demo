const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./pool');

const catalogPath = path.join(__dirname, 'lulu-products.json');

async function run() {
  const pool = getPool();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const products = [...catalog.men, ...catalog.women].filter((item) => item.image);

  let updated = 0;
  for (const item of products) {
    const result = await pool.query(
      `UPDATE products SET image_url = $1 WHERE name = $2`,
      [item.image, item.name]
    );
    updated += result.rowCount || 0;
  }

  await closePool();
  console.log(`Updated ${updated} products`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
