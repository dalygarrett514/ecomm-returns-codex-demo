const { getPool, closePool } = require('./pool');

function mulberry32(seed) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function pickN(rng, list, count) {
  const result = [];
  const copy = [...list];
  while (result.length < count && copy.length > 0) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function slugify(value) {
  return String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

function inferIssueBias(name) {
  const lower = name.toLowerCase();

  if (lower.includes('bag') || lower.includes('tote') || lower.includes('duffle') || lower.includes('belt')) {
    return { quality: 0.55, not_as_described: 0.3, sizing: 0.15 };
  }

  if (lower.includes('bra') || lower.includes('tank') || lower.includes('top') || lower.includes('shirt')) {
    return { sizing: 0.35, quality: 0.35, not_as_described: 0.3 };
  }

  if (lower.includes('pant') || lower.includes('tight') || lower.includes('short') || lower.includes('jogger') || lower.includes('skirt')) {
    return { sizing: 0.55, quality: 0.25, not_as_described: 0.2 };
  }

  return { sizing: 0.33, quality: 0.33, not_as_described: 0.34 };
}

function weightedPick(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let target = rng() * total;
  for (const [key, weight] of entries) {
    if (target <= weight) {
      return key;
    }
    target -= weight;
  }
  return entries[0][0];
}

function buildReason(rng, context) {
  const { productName, category, size, color, useCase, comparison, wearCount, weather } = context;

  const intro = pick(rng, [
    `Picked this up for ${useCase}.`,
    `Bought this for ${useCase} and wore it right away.`,
    `Ordered the ${productName.toLowerCase()} for ${useCase}.`,
    `Grabbed this in ${color} because I needed something for ${useCase}.`,
    `Bought this as a gift and tried it on before wrapping.`
  ]);

  const fitIssues = [
    `The ${size} felt tight through the hips but loose in the waist.`,
    `The ${size} runs longer than expected and bunches at the ankle.`,
    `The waistband rolled after a short walk and the rise felt lower than my other lululemon pieces.`,
    `Sleeves sit higher than pictured and the shoulder seam pulls.`,
    `The inseam feels shorter than the size chart by at least an inch.`,
    `The chest fit is snug but the hem flares out.`,
    `The straps dig in after 20 minutes.`,
    `The leg opening feels wider than expected and looks baggy in motion.`
  ];

  const qualityIssues = [
    `After ${wearCount} wears, the inner thigh showed pilling and the fabric lost its smooth feel.`,
    `The zipper snagged within the first week and now catches the seam.`,
    `A seam started unraveling near the pocket after a gentle wash.`,
    `Fabric picked up lint quickly and looks worn faster than my older pair.`,
    `Stitching around the hem looks uneven in a few spots.`,
    `The pocket edge started to fray after the second wash.`,
    `The fabric developed a sheen in high-friction areas.`,
    `The drawcord aglets cracked after a single wash.`
  ];

  const descriptionIssues = [
    `Color looks more muted in person and reads closer to charcoal than ${color}.`,
    `The fabric feels thinner than the product page suggested.`,
    `The drape is stiffer than the photos and not as fluid.`,
    `The texture is more ribbed than expected and looks different under daylight.`,
    `The compression level is higher than described and feels restrictive.`,
    `The handfeel is slicker than expected and not as soft.`,
    `The fabric has more shine than it appears online.`
  ];

  const performanceNotes = [
    `Compared to ${comparison}, this feels less supportive.`,
    `It felt different once I tested it in ${weather} weather.`,
    `I expected the same handfeel as my previous lululemon purchase, but it is noticeably different.`,
    `The fabric showed sweat marks more than I expected.`,
    `The pockets shift forward when I move.`,
    `The waistband digs in once I start moving.`
  ];

  const contextNotes = [
    `Tried it on with a sports bra and the straps showed through more than I expected.`,
    `The side seams twist slightly after a wash.`,
    `The fabric clings in humid weather.`,
    `The length feels shorter once I start running.`,
    `The fabric feels warmer than expected for this season.`
  ];

  const endings = [
    `Returning to size up and try another color.`,
    `Returning and would repurchase if the fit was adjusted.`,
    `Returning and hoping for a more durable version.`,
    `Returning because it doesn’t match the look I wanted in person.`,
    `Returning and will try a different style instead.`
  ];

  const sentenceBank = [];
  if (category === 'sizing') sentenceBank.push(pick(rng, fitIssues));
  if (category === 'quality') sentenceBank.push(pick(rng, qualityIssues));
  if (category === 'not_as_described') sentenceBank.push(pick(rng, descriptionIssues));

  if (rng() > 0.2) sentenceBank.push(pick(rng, performanceNotes));
  if (rng() > 0.35) sentenceBank.push(pick(rng, contextNotes));
  if (rng() > 0.5) sentenceBank.push(pick(rng, endings));

  const orderStyle = rng() > 0.5
    ? [intro, ...sentenceBank]
    : [...sentenceBank, intro];

  return orderStyle.join(' ');
}


async function seed() {
  const pool = getPool();
  const rng = mulberry32(42);

  const merchants = ['lululemon'];

  const productCatalog = require('./lulu-products.json');
  const products = [...productCatalog.men, ...productCatalog.women];

  const firstNames = [
    'Avery', 'Jordan', 'Quinn', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Parker', 'Rowan', 'Elliot', 'Charlie', 'Skyler',
    'Drew', 'Reese', 'Ari', 'Sage', 'Cameron', 'Emerson', 'Dakota', 'Alex', 'Marin', 'Bailey', 'Sydney', 'Logan',
    'Sawyer', 'Harper', 'Jesse', 'Finley', 'Kendall', 'Hayden', 'Arielle', 'Noah', 'Maddox', 'Rory', 'Phoenix', 'Tatum',
    'Kai', 'Shiloh', 'River', 'Indigo', 'Milan', 'Emery', 'Lennon', 'Ashton', 'Juniper', 'Remy', 'Sloane', 'Jules',
    'Aubrey', 'Maya', 'Zoe', 'Nina', 'Luca', 'Ivy', 'Milo', 'Evelyn', 'Ella', 'Mia', 'Olivia', 'Levi', 'Nora', 'Aiden'
  ];
  const lastNames = [
    'Park', 'Reese', 'Patel', 'Diaz', 'Kim', 'Brooks', 'Wells', 'Blake', 'James', 'Nguyen', 'Ortiz', 'Thompson', 'Bennett',
    'Harper', 'Coleman', 'Singh', 'Lee', 'Hayes', 'Rivera', 'Foster', 'Carter', 'Chen', 'Ellis', 'Reed', 'Lewis', 'Gray',
    'Rogers', 'Ross', 'Cruz', 'Quinn', 'Shaw', 'Lane', 'Ward', 'Knox', 'Mitchell', 'Grant', 'Bell', 'Price', 'Flynn',
    'Stone', 'Monroe', 'Nash', 'Reid', 'Santos', 'Wright', 'Young', 'Gomez', 'Reyes', 'Powell', 'Brody'
  ];

  const customers = [];
  const usedNames = new Set();
  while (customers.length < 120) {
    const name = `${pick(rng, firstNames)} ${pick(rng, lastNames)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      customers.push({ name, sub: `auth0|customer-${String(customers.length + 1).padStart(3, '0')}` });
    }
  }

  const demoCustomer = { name: 'Avery Parker', sub: 'auth0|customer-demo' };

  const sizes = ['2', '4', '6', '8', '10', '12', 'S', 'M', 'L', 'XL'];
  const colors = ['black', 'bone', 'espresso', 'storm teal', 'graphite grey', 'true navy', 'silver drop', 'java', 'heathered grey', 'rosewood'];
  const useCases = ['a 5-mile run', 'hot yoga', 'strength training', 'commuting', 'travel', 'weekend errands', 'a long shift', 'a studio class'];
  const comparisons = ['my previous lululemon purchase', 'a similar item from last season', 'the product photos'];
  const weathers = ['rainy', 'humid', 'cool', 'dry', 'windy', 'cold'];

  const uniqueReasons = new Set();

  await pool.query('BEGIN');

  try {
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT');

    await pool.query('TRUNCATE action_items, ai_insights, return_ai_analysis, returns, order_items, orders, products, merchants RESTART IDENTITY CASCADE');

    const merchantResult = await pool.query('INSERT INTO merchants (name) VALUES ($1) RETURNING id', [merchants[0]]);
    const merchantId = merchantResult.rows[0].id;

    const productIds = [];
    products.forEach((product, index) => {
      const sku = `LLM-${slugify(product.name)}-${String(index + 1).padStart(3, '0')}`;
      const price = Math.max(product.price || 0, 10500);
      productIds.push({
        sku,
        name: product.name,
        price,
        image: product.image || 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600'
      });
    });

    for (const product of productIds) {
      await pool.query(
        `INSERT INTO products (merchant_id, name, sku, image_url, price_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [merchantId, product.name, product.sku, product.image, product.price]
      );
    }

    const dbProducts = await pool.query('SELECT id, name, price_cents FROM products');

    const dbProductIds = dbProducts.rows.map((row) => row.id);
    const featuredProductIds = pickN(rng, dbProductIds, 5);

    const orderIds = [];
    for (let i = 0; i < 640; i += 1) {
      const customer = pick(rng, customers);
      const daysAgo = Math.floor(rng() * 120);
      const statusRoll = rng();
      const status = statusRoll > 0.7 ? 'delivered' : statusRoll > 0.4 ? 'shipping' : 'processing';
      const deliveredAt = status === 'delivered' ? `NOW() - (${daysAgo} || ' days')::interval + interval '3 days'` : 'NULL';

      const order = await pool.query(
        `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
         VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, ${deliveredAt})
         RETURNING id`,
        [customer.sub, customer.name, status, daysAgo]
      );
      orderIds.push({ id: order.rows[0].id, customer });
    }

    for (let i = 0; i < 6; i += 1) {
      const status = i < 3 ? 'delivered' : i === 3 ? 'shipping' : 'processing';
      const daysAgo = 1 + i * 2;
      const deliveredAt = status === 'delivered' ? `NOW() - (${daysAgo} || ' days')::interval + interval '2 days'` : 'NULL';
      const order = await pool.query(
        `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
         VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, ${deliveredAt})
         RETURNING id`,
        [demoCustomer.sub, demoCustomer.name, status, daysAgo]
      );
      orderIds.push({ id: order.rows[0].id, customer: demoCustomer });
    }

    const orderItems = [];
    for (const order of orderIds) {
      const itemCount = 1 + Math.floor(rng() * 3);
      const items = pickN(rng, dbProducts.rows.filter((row) => featuredProductIds.includes(row.id)), itemCount);
      for (const item of items) {
        const quantity = rng() > 0.75 ? 2 : 1;
        const oi = await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4)
           RETURNING id, product_id`,
          [order.id, item.id, quantity, item.price_cents]
        );
        orderItems.push({
          id: oi.rows[0].id,
          productId: item.id,
          productName: item.name,
          customer: order.customer
        });
      }
    }

    // Force high but realistic return volume per product for analytics demo.
    const forcedOrderItems = [];
    const forcedItemIds = new Set();
    for (const product of dbProducts.rows) {
      const returnItems = 120 + Math.floor(rng() * 181);
      const nonReturnItems = 700 + Math.floor(rng() * 401);

      for (let i = 0; i < returnItems; i += 1) {
        const customer = pick(rng, customers);
        const daysAgo = Math.floor(rng() * 90);
        const order = await pool.query(
          `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
           VALUES ($1, $2, 'delivered', NOW() - ($3 || ' days')::interval, NOW() - ($3 || ' days')::interval + interval '2 days')
           RETURNING id`,
          [customer.sub, customer.name, daysAgo]
        );
        const oi = await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
           VALUES ($1, $2, 1, $3)
           RETURNING id, product_id`,
          [order.rows[0].id, product.id, product.price_cents]
        );
        forcedOrderItems.push({
          id: oi.rows[0].id,
          productId: product.id,
          productName: product.name,
          customer
        });
        forcedItemIds.add(oi.rows[0].id);
      }

      for (let i = 0; i < nonReturnItems; i += 1) {
        const customer = pick(rng, customers);
        const daysAgo = Math.floor(rng() * 120);
        const order = await pool.query(
          `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
           VALUES ($1, $2, 'delivered', NOW() - ($3 || ' days')::interval, NOW() - ($3 || ' days')::interval + interval '2 days')
           RETURNING id`,
          [customer.sub, customer.name, daysAgo]
        );
        await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
           VALUES ($1, $2, 1, $3)`,
          [order.rows[0].id, product.id, product.price_cents]
        );
      }
    }

    const returns = [];
    for (const item of [...orderItems, ...forcedOrderItems]) {
      if (!forcedItemIds.has(item.id) && rng() > 0.55) {
        continue;
      }

      const bias = inferIssueBias(item.productName);
      const category = weightedPick(rng, bias);
      const size = pick(rng, sizes);
      const color = pick(rng, colors);
      const useCase = pick(rng, useCases);
      const comparison = pick(rng, comparisons);
      const wearCount = 1 + Math.floor(rng() * 6);
      const weather = pick(rng, weathers);

      let reason = buildReason(rng, {
        productName: item.productName,
        category,
        size,
        color,
        useCase,
        comparison,
        wearCount,
        weather
      });

      while (uniqueReasons.has(reason)) {
        reason = `${reason} Noticed it again after another wash.`;
      }

      uniqueReasons.add(reason);

      const submittedDaysAgo = Math.floor(rng() * 45);
      const ret = await pool.query(
        `INSERT INTO returns (order_item_id, customer_sub, reason_text, category_hint, status, submitted_at)
         VALUES ($1, $2, $3, $4, 'processed', NOW() - ($5 || ' days')::interval)
         RETURNING id`,
        [item.id, item.customer.sub, reason, category, submittedDaysAgo]
      );

      returns.push({ id: ret.rows[0].id, category, reason });
    }

    for (const ret of returns) {
      const severity = ret.reason.includes('unraveling') || ret.reason.includes('snagged') ? 'high' : ret.reason.includes('pilling') ? 'medium' : 'low';
      await pool.query(
        `INSERT INTO return_ai_analysis (return_id, category, sentiment, severity, confidence, summary, raw_json)
         VALUES ($1, $2, 'negative', $3, $4, $5, $6::jsonb)`,
        [
          ret.id,
          ret.category,
          severity,
          0.9,
          `Auto-classified ${ret.category} issue from return narrative.`,
          JSON.stringify({ category: ret.category, severity, confidence: 0.9, source: 'seed' })
        ]
      );
    }

    await pool.query('COMMIT');
    console.log('Seed completed. Products:', products.length, 'Orders:', orderIds.length, 'Returns:', returns.length, 'Unique reasons:', uniqueReasons.size);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
