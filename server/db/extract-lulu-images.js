const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, 'lulu-products.json');

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\\s+/g, ' ')
    .replace(/[^a-z0-9\\s]/g, '')
    .trim();
}

function extractNextData(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function extractFromProductNode(node, results) {
  if (!node || !node.displayName) return;
  if (!node.skuStyleOrder || !Array.isArray(node.skuStyleOrder)) return;
  for (const sku of node.skuStyleOrder) {
    if (sku && Array.isArray(sku.images) && sku.images[0]) {
      results.push({ name: node.displayName, image: sku.images[0] });
      return;
    }
  }
}

function walk(node, results) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => walk(item, results));
    return;
  }
  if (typeof node !== 'object') return;

  extractFromProductNode(node, results);

  Object.values(node).forEach((value) => walk(value, results));
}

function extractImages(html) {
  const results = [];
  const nextData = extractNextData(html);
  if (nextData) {
    walk(nextData, results);
  }
  return results;
}

function mergeImages(catalog, entries) {
  const byName = new Map();
  entries.forEach((entry) => {
    const key = normalizeName(entry.name);
    if (key && entry.image) {
      byName.set(key, entry.image);
    }
  });

  let updated = 0;
  ['men', 'women'].forEach((section) => {
    catalog[section] = catalog[section].map((item) => {
      const key = normalizeName(item.name);
      const image = byName.get(key);
      if (image && item.image !== image) {
        updated += 1;
        return { ...item, image };
      }
      return item;
    });
  });

  return updated;
}

function run() {
  const menPath = process.argv[2];
  const womenPath = process.argv[3];
  if (!menPath || !womenPath) {
    console.log('Usage: node server/db/extract-lulu-images.js /path/men.html /path/women.html');
    process.exit(1);
  }

  const menHtml = fs.readFileSync(menPath, 'utf8');
  const womenHtml = fs.readFileSync(womenPath, 'utf8');

  const menImages = extractImages(menHtml);
  const womenImages = extractImages(womenHtml);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  const updated = mergeImages(catalog, [...menImages, ...womenImages]);
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`Updated ${updated} products in catalog`);
}

run();
