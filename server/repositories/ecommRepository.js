const { query, getPool } = require('../db/pool');

function mapProductSort(sortBy) {
  switch (sortBy) {
    case 'costImpact':
      return 'estimated_cost_cents DESC, total_returns DESC';
    case 'newestIssues':
      return 'latest_return_at DESC';
    case 'mostReturns':
    default:
      return 'total_returns DESC';
  }
}

async function listCustomerOrders(customerSub) {
  const result = await query(
    `SELECT
       o.id AS order_id,
       o.status,
       o.delivered_at,
       oi.id AS order_item_id,
       oi.quantity,
       oi.unit_price_cents,
       p.id AS product_id,
       p.name AS product_name,
       p.image_url,
       p.sku
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     INNER JOIN products p ON p.id = oi.product_id
     WHERE o.customer_sub = $1
     ORDER BY o.delivered_at DESC NULLS LAST, o.id DESC`,
    [customerSub]
  );

  return result.rows;
}

async function seedCustomerOrders(customerSub, customerName) {
  const products = await query(
    `SELECT id, name, price_cents
     FROM products
     ORDER BY RANDOM()
     LIMIT 5`
  );

  if (products.rows.length === 0) {
    return;
  }

  const statusPlan = ['delivered', 'delivered', 'shipping', 'processing', 'in_transit'];
  for (let i = 0; i < statusPlan.length; i += 1) {
    const status = statusPlan[i];
    const daysAgo = 2 + i * 2;
    const deliveredAt = status === 'delivered' ? `NOW() - (${daysAgo} || ' days')::interval + interval '2 days'` : 'NULL';
    const order = await query(
      `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
       VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, ${deliveredAt})
       RETURNING id`,
      [customerSub, customerName || 'Customer', status, daysAgo]
    );

    const itemCount = status === 'delivered' ? 2 : 1;
    for (let j = 0; j < itemCount; j += 1) {
      const product = products.rows[(i + j) % products.rows.length];
      await query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
         VALUES ($1, $2, 1, $3)`,
        [order.rows[0].id, product.id, product.price_cents]
      );
    }
  }
}

async function ensureCustomerOrderStatus(customerSub, customerName, status) {
  const existing = await query(
    `SELECT id FROM orders WHERE customer_sub = $1 AND status = $2 LIMIT 1`,
    [customerSub, status]
  );
  if (existing.rows.length > 0) {
    return;
  }

  const product = await query(
    `SELECT id, price_cents FROM products ORDER BY RANDOM() LIMIT 1`
  );
  if (product.rows.length === 0) {
    return;
  }

  const daysAgo = 1;
  const deliveredAt = status === 'delivered' ? `NOW() - (${daysAgo} || ' days')::interval + interval '2 days'` : 'NULL';
  const order = await query(
    `INSERT INTO orders (customer_sub, customer_name, status, created_at, delivered_at)
     VALUES ($1, $2, $3, NOW() - ($4 || ' days')::interval, ${deliveredAt})
     RETURNING id`,
    [customerSub, customerName || 'Customer', status, daysAgo]
  );

  await query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
     VALUES ($1, $2, 1, $3)`,
    [order.rows[0].id, product.rows[0].id, product.rows[0].price_cents]
  );
}

async function getOrderItemWithProduct(orderItemId) {
  const result = await query(
    `SELECT
       oi.id AS order_item_id,
       oi.unit_price_cents,
       p.id AS product_id,
       p.name AS product_name,
       p.sku,
       p.image_url,
       p.merchant_id
     FROM order_items oi
     INNER JOIN products p ON p.id = oi.product_id
     WHERE oi.id = $1`,
    [orderItemId]
  );

  return result.rows[0] || null;
}

async function createReturn(payload) {
  const result = await query(
    `INSERT INTO returns (order_item_id, customer_sub, reason_text, category_hint, photo_url, status)
     VALUES ($1, $2, $3, $4, $5, 'submitted')
     RETURNING id, submitted_at`,
    [
      payload.orderItemId,
      payload.customerSub,
      payload.reasonText,
      payload.categoryHint || null,
      payload.photoUrl || null
    ]
  );

  return result.rows[0];
}

async function markReturnProcessed(returnId) {
  await query(`UPDATE returns SET status = 'processed' WHERE id = $1`, [returnId]);
}

async function saveReturnAnalysis(returnId, analysis) {
  await query(
    `INSERT INTO return_ai_analysis (return_id, category, sentiment, severity, confidence, summary, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (return_id)
     DO UPDATE SET
       category = EXCLUDED.category,
       sentiment = EXCLUDED.sentiment,
       severity = EXCLUDED.severity,
       confidence = EXCLUDED.confidence,
       summary = EXCLUDED.summary,
       raw_json = EXCLUDED.raw_json,
       analyzed_at = NOW()`,
    [
      returnId,
      analysis.category,
      analysis.sentiment,
      analysis.severity,
      analysis.confidence,
      analysis.summary,
      JSON.stringify(analysis)
    ]
  );
}

async function listCustomerReturns(customerSub) {
  const result = await query(
    `SELECT
       r.id,
       r.order_item_id,
       r.status,
       r.reason_text,
       r.submitted_at,
       p.name AS product_name,
       p.image_url,
       a.category,
       a.sentiment,
       a.severity,
       a.confidence
     FROM returns r
     INNER JOIN order_items oi ON oi.id = r.order_item_id
     INNER JOIN products p ON p.id = oi.product_id
     LEFT JOIN return_ai_analysis a ON a.return_id = r.id
     WHERE r.customer_sub = $1
     ORDER BY r.submitted_at DESC`,
    [customerSub]
  );

  return result.rows;
}

async function getMerchantDashboard(merchantId) {
  const [totals, trend, topIssues] = await Promise.all([
    query(
      `WITH merchant_items AS (
         SELECT oi.id, oi.unit_price_cents
         FROM order_items oi
         INNER JOIN products p ON p.id = oi.product_id
         WHERE p.merchant_id = $1
       ),
       merchant_returns AS (
         SELECT r.id, r.order_item_id, r.submitted_at
         FROM returns r
         INNER JOIN merchant_items mi ON mi.id = r.order_item_id
       )
       SELECT
         (SELECT COUNT(*) FROM merchant_returns) AS total_returns,
         (SELECT COUNT(*) FROM merchant_items) AS total_order_items,
         (SELECT COALESCE(SUM(mi.unit_price_cents), 0)
          FROM merchant_returns mr
          INNER JOIN merchant_items mi ON mi.id = mr.order_item_id) AS cost_of_returns_cents,
         (SELECT COUNT(*) FROM ai_insights i
          INNER JOIN products p ON p.id = i.product_id
          WHERE p.merchant_id = $1) AS ai_insights_generated`,
      [merchantId]
    ),
    query(
      `WITH day_series AS (
         SELECT generate_series(
           date_trunc('day', NOW()) - INTERVAL '29 day',
           date_trunc('day', NOW()),
           INTERVAL '1 day'
         )::date AS day
       )
       SELECT
         ds.day,
         COALESCE(COUNT(r.id), 0) AS returns
       FROM day_series ds
       LEFT JOIN returns r ON date_trunc('day', r.submitted_at)::date = ds.day
       LEFT JOIN order_items oi ON oi.id = r.order_item_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE p.merchant_id = $1 OR p.merchant_id IS NULL
       GROUP BY ds.day
       ORDER BY ds.day ASC`,
      [merchantId]
    ),
    query(
      `SELECT
         a.category,
         COUNT(*)::INTEGER AS count
       FROM return_ai_analysis a
       INNER JOIN returns r ON r.id = a.return_id
       INNER JOIN order_items oi ON oi.id = r.order_item_id
       INNER JOIN products p ON p.id = oi.product_id
       WHERE p.merchant_id = $1
       GROUP BY a.category
       ORDER BY count DESC
       LIMIT 5`,
      [merchantId]
    )
  ]);

  const metricRow = totals.rows[0] || {
    total_returns: 0,
    total_order_items: 0,
    cost_of_returns_cents: 0,
    ai_insights_generated: 0
  };

  const totalReturns = Number(metricRow.total_returns || 0);
  const totalOrderItems = Number(metricRow.total_order_items || 0);

  return {
    metrics: {
      totalReturns,
      returnRate: totalOrderItems === 0 ? 0 : Number((totalReturns / totalOrderItems).toFixed(4)),
      costOfReturnsCents: Number(metricRow.cost_of_returns_cents || 0),
      aiInsightsGenerated: Number(metricRow.ai_insights_generated || 0)
    },
    trend: trend.rows,
    topIssues: topIssues.rows
  };
}

async function listMerchantProducts(merchantId, sortBy = 'mostReturns') {
  const sortSql = mapProductSort(sortBy);
  const result = await query(
    `WITH order_item_counts AS (
       SELECT
         oi.product_id,
         COUNT(*)::INTEGER AS total_order_items
       FROM order_items oi
       GROUP BY oi.product_id
     ),
     return_counts AS (
       SELECT
         oi.product_id,
         COUNT(r.id)::INTEGER AS total_returns,
         COALESCE(SUM(oi.unit_price_cents), 0)::INTEGER AS estimated_cost_cents,
         MAX(r.submitted_at) AS latest_return_at
       FROM order_items oi
       INNER JOIN returns r ON r.order_item_id = oi.id
       GROUP BY oi.product_id
     ),
     product_returns AS (
       SELECT
         p.id AS product_id,
         p.name,
         p.sku,
         p.image_url,
         p.price_cents,
         COALESCE(rc.total_returns, 0)::INTEGER AS total_returns,
         COALESCE(rc.estimated_cost_cents, 0)::INTEGER AS estimated_cost_cents,
         rc.latest_return_at,
         COALESCE(oic.total_order_items, 0)::INTEGER AS total_order_items
       FROM products p
       LEFT JOIN return_counts rc ON rc.product_id = p.id
       LEFT JOIN order_item_counts oic ON oic.product_id = p.id
       WHERE p.merchant_id = $1
     ),
     category_breakdown AS (
       SELECT
         p.id AS product_id,
         a.category,
         COUNT(*)::INTEGER AS category_count
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN returns r ON r.order_item_id = oi.id
       LEFT JOIN return_ai_analysis a ON a.return_id = r.id
       WHERE p.merchant_id = $1
         AND a.category IS NOT NULL
       GROUP BY p.id, a.category
     )
     SELECT
       pr.*,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT('category', cb.category, 'count', cb.category_count)
         ) FILTER (WHERE cb.category IS NOT NULL),
         '[]'::json
       ) AS category_breakdown
     FROM product_returns pr
     LEFT JOIN category_breakdown cb ON cb.product_id = pr.product_id
     GROUP BY pr.product_id, pr.name, pr.sku, pr.image_url, pr.price_cents, pr.total_returns, pr.estimated_cost_cents, pr.latest_return_at, pr.total_order_items
     ORDER BY ${sortSql}`,
    [merchantId]
  );

  return result.rows.map((row) => ({
    ...row,
    return_rate:
      Number(row.total_order_items || 0) === 0
        ? 0
        : Number((Number(row.total_returns || 0) / Number(row.total_order_items || 1)).toFixed(4))
  }));
}

async function getProductDetail(productId, merchantId) {
  const [productResult, returnsResult, insightResult] = await Promise.all([
    query(
      `SELECT id, merchant_id, name, sku, image_url, price_cents
       FROM products
       WHERE id = $1 AND merchant_id = $2`,
      [productId, merchantId]
    ),
    query(
      `SELECT
         r.id,
         r.submitted_at,
         r.reason_text,
         r.status,
         a.category,
         a.severity,
         a.sentiment,
         a.confidence,
         COALESCE(o.customer_name, o.customer_sub) AS customer_name,
         o.customer_sub
       FROM returns r
       INNER JOIN order_items oi ON oi.id = r.order_item_id
       INNER JOIN orders o ON o.id = oi.order_id
       LEFT JOIN return_ai_analysis a ON a.return_id = r.id
       WHERE oi.product_id = $1
       ORDER BY r.submitted_at DESC`,
      [productId]
    ),
    query(
      `SELECT id, title, description, priority, confidence, estimated_savings_cents, returns_analyzed, recommendations, source_pattern, created_at
       FROM ai_insights
       WHERE product_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [productId]
    )
  ]);

  return {
    product: productResult.rows[0] || null,
    returns: returnsResult.rows,
    latestInsight: insightResult.rows[0] || null
  };
}

async function listReturnsForPatternDetection(productId, merchantId) {
  const result = await query(
    `SELECT
       r.id,
       r.reason_text,
       r.submitted_at,
       a.category,
       a.severity,
       a.sentiment,
       a.confidence,
       p.name AS product_name,
       p.sku,
       oi.unit_price_cents
     FROM returns r
     INNER JOIN order_items oi ON oi.id = r.order_item_id
     INNER JOIN products p ON p.id = oi.product_id
     LEFT JOIN return_ai_analysis a ON a.return_id = r.id
     WHERE p.id = $1
       AND p.merchant_id = $2
     ORDER BY r.submitted_at DESC`,
    [productId, merchantId]
  );

  return result.rows;
}

async function getInsightForMerchant(insightId, merchantId) {
  const result = await query(
    `SELECT
       i.id,
       i.product_id,
       i.recommendations,
       i.source_pattern,
       i.estimated_savings_cents,
       i.priority,
       i.confidence,
       p.name AS product_name,
       p.sku AS product_sku,
       p.image_url
     FROM ai_insights i
     INNER JOIN products p ON p.id = i.product_id
     WHERE i.id = $1 AND p.merchant_id = $2`,
    [insightId, merchantId]
  );

  return result.rows[0] || null;
}

async function insertActionItem(insightId, productId, payload) {
  const result = await query(
    `INSERT INTO action_items (
       insight_id,
       product_id,
       description,
       priority,
       estimated_impact_cents,
       status,
       assigned_to,
       due_date
     ) VALUES ($1, $2, $3, $4, $5, 'New', NULL, NULL)
     RETURNING *`,
    [
      insightId,
      productId,
      payload.description,
      payload.priority,
      payload.estimatedImpactCents || 0
    ]
  );

  return result.rows[0];
}

async function insertInsight(productId, insight) {
  const result = await query(
    `INSERT INTO ai_insights (
      product_id,
      title,
      description,
      priority,
      confidence,
      estimated_savings_cents,
      returns_analyzed,
      recommendations,
      source_pattern
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
    RETURNING id, created_at`,
    [
      productId,
      insight.title,
      insight.description,
      insight.priority,
      insight.confidence,
      insight.estimatedSavingsCents,
      insight.returnsAnalyzed,
      JSON.stringify(insight.recommendations),
      JSON.stringify(insight.sourcePattern)
    ]
  );

  return result.rows[0];
}

async function insertActionItems(insightId, productId, recommendationList = []) {
  if (String(process.env.BULK_ACTIONS_DISABLED || 'true') === 'true') {
    throw new Error('Bulk action item creation is disabled. Use per-action creation endpoint.');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const recommendation of recommendationList) {
      await client.query(
        `INSERT INTO action_items (
           insight_id,
           product_id,
           description,
           priority,
           estimated_impact_cents,
           status,
           assigned_to,
           due_date
         ) VALUES ($1, $2, $3, $4, $5, 'New', NULL, NULL)`,
        [
          insightId,
          productId,
          recommendation.action,
          recommendation.priority,
          recommendation.estimatedImpactCents || 0
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listActionItems(merchantId, filters = {}) {
  const clauses = ['p.merchant_id = $1'];
  const params = [merchantId];

  if (filters.productId) {
    params.push(Number(filters.productId));
    clauses.push(`a.product_id = $${params.length}`);
  }

  if (filters.priority) {
    params.push(filters.priority);
    clauses.push(`a.priority = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`a.status = $${params.length}`);
  }

  if (filters.assignedTo) {
    params.push(filters.assignedTo);
    clauses.push(`a.assigned_to = $${params.length}`);
  }

  const result = await query(
    `SELECT
       a.id,
       a.description,
       a.priority,
       a.estimated_impact_cents,
       a.status,
       a.assigned_to,
       a.due_date,
       a.impact_note,
       a.created_at,
       p.id AS product_id,
       p.name AS product_name,
       p.image_url
     FROM action_items a
     INNER JOIN products p ON p.id = a.product_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY
       CASE a.priority
         WHEN 'Critical' THEN 1
         WHEN 'High' THEN 2
         WHEN 'Medium' THEN 3
         ELSE 4
       END,
       a.created_at DESC`,
    params
  );

  return result.rows;
}

async function updateActionItem(actionItemId, merchantId, patch = {}) {
  const fields = [];
  const params = [];

  if (patch.status) {
    params.push(patch.status);
    fields.push(`status = $${params.length}`);
  }

  if (patch.assignedTo !== undefined) {
    params.push(patch.assignedTo || null);
    fields.push(`assigned_to = $${params.length}`);
  }

  if (patch.dueDate !== undefined) {
    params.push(patch.dueDate || null);
    fields.push(`due_date = $${params.length}`);
  }

  if (patch.impactNote !== undefined) {
    params.push(patch.impactNote || null);
    fields.push(`impact_note = $${params.length}`);
  }

  if (fields.length === 0) {
    return null;
  }

  params.push(actionItemId);
  params.push(merchantId);

  const result = await query(
    `UPDATE action_items a
     SET ${fields.join(', ')}
     FROM products p
     WHERE a.product_id = p.id
       AND a.id = $${params.length - 1}
       AND p.merchant_id = $${params.length}
     RETURNING a.*`,
    params
  );

  if (!result.rows[0]) {
    return null;
  }

  const enriched = await query(
    `SELECT
       a.*,
       p.name AS product_name,
       p.image_url,
       i.title AS insight_title
     FROM action_items a
     INNER JOIN products p ON p.id = a.product_id
     LEFT JOIN ai_insights i ON i.id = a.insight_id
     WHERE a.id = $1`,
    [actionItemId]
  );

  return enriched.rows[0] || result.rows[0];

  return result.rows[0] || null;
}

module.exports = {
  listCustomerOrders,
  getOrderItemWithProduct,
  createReturn,
  markReturnProcessed,
  saveReturnAnalysis,
  listCustomerReturns,
  getMerchantDashboard,
  listMerchantProducts,
  getProductDetail,
  listReturnsForPatternDetection,
  getInsightForMerchant,
  insertActionItem,
  insertInsight,
  insertActionItems,
  listActionItems,
  updateActionItem
  ,
  seedCustomerOrders
  ,
  ensureCustomerOrderStatus
};
