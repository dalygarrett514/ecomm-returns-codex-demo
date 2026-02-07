const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, 'lulu-products.json');

async function getFetch() {
  if (global.fetch) return global.fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

function extractImageUrl(html) {
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch && ogMatch[1]) {
    return ogMatch[1];
  }

  const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch && ldMatch[1]) {
    try {
      const data = JSON.parse(ldMatch[1].trim());
      if (Array.isArray(data.image) && data.image[0]) return data.image[0];
      if (typeof data.image === 'string') return data.image;
    } catch (error) {
      // Ignore JSON parse errors and fall back to regex search.
    }
  }

  const imgMatch = html.match(/"image"\s*:\s*"(https:[^"]+)"/i);
  if (imgMatch && imgMatch[1]) {
    return imgMatch[1].replace(/\\u002F/g, '/');
  }

  return null;
}

async function run() {
  const fetch = await getFetch();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sections = ['men', 'women'];

  for (const section of sections) {
    for (const item of catalog[section]) {
      if (item.image) continue;
      if (!item.pdpUrl) continue;

      const url = `https://shop.lululemon.com${item.pdpUrl}`;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
          }
        });
        if (!response.ok) {
          // Skip if not found.
          continue;
        }
        const html = await response.text();
        const imageUrl = extractImageUrl(html);
        if (imageUrl) {
          item.image = imageUrl;
          console.log(`image set for ${item.name}`);
        }
      } catch (error) {
        console.log(`failed to fetch ${item.name}: ${error.message}`);
      }
    }
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
