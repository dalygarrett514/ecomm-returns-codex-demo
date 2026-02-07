const express = require('express');
const { requireRole } = require('../middleware/rbac');
const {
  listCustomerOrders,
  seedCustomerOrders,
  ensureCustomerOrderStatus,
  getOrderItemWithProduct,
  createReturn,
  listCustomerReturns
} = require('../repositories/ecommRepository');
const { processReturnAnalysis, generateProductInsight } = require('../services/analyticsService');

const router = express.Router();

function groupOrders(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.order_id)) {
      map.set(row.order_id, {
        id: row.order_id,
        status: row.status,
        deliveredAt: row.delivered_at,
        items: []
      });
    }

    map.get(row.order_id).items.push({
      orderItemId: row.order_item_id,
      quantity: row.quantity,
      unitPriceCents: row.unit_price_cents,
      product: {
        id: row.product_id,
        name: row.product_name,
        imageUrl: row.image_url,
        sku: row.sku
      }
    });
  });

  return Array.from(map.values());
}

router.use(requireRole('customer'));

router.get('/orders', async (req, res, next) => {
  try {
    let rows = await listCustomerOrders(req.user.sub);
    if (rows.length === 0) {
      await seedCustomerOrders(req.user.sub, req.user.name);
      rows = await listCustomerOrders(req.user.sub);
    }
    if (!rows.some((row) => row.status === 'in_transit')) {
      await ensureCustomerOrderStatus(req.user.sub, req.user.name, 'in_transit');
      rows = await listCustomerOrders(req.user.sub);
    }
    res.json({ orders: groupOrders(rows) });
  } catch (error) {
    next(error);
  }
});

router.get('/returns', async (req, res, next) => {
  try {
    const rows = await listCustomerReturns(req.user.sub);
    res.json({ returns: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/returns', async (req, res, next) => {
  try {
    const { orderItemId, reasonText, categoryHint, photoUrl } = req.body;

    if (!orderItemId || !reasonText || typeof reasonText !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'orderItemId and reasonText are required.'
      });
    }

    const item = await getOrderItemWithProduct(orderItemId);

    if (!item) {
      return res.status(404).json({
        error: 'order_item_not_found'
      });
    }

    const createdReturn = await createReturn({
      orderItemId,
      customerSub: req.user.sub,
      reasonText,
      categoryHint,
      photoUrl
    });

    const analysis = await processReturnAnalysis({
      returnId: createdReturn.id,
      reasonText,
      categoryHint,
      product: {
        id: item.product_id,
        name: item.product_name,
        sku: item.sku
      }
    });

    generateProductInsight({ productId: item.product_id, merchantId: item.merchant_id, threshold: 10 }).catch(() => {
      // Insight generation is best-effort after return analysis and should not fail customer flow.
    });

    return res.status(201).json({
      message: 'Return submitted and analyzed.',
      returnId: createdReturn.id,
      analysis
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
