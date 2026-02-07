const express = require('express');
const { requireRole } = require('../middleware/rbac');
const {
  getMerchantDashboard,
  listMerchantProducts,
  getProductDetail,
  getInsightForMerchant,
  insertActionItem,
  listActionItems,
  updateActionItem
} = require('../repositories/ecommRepository');
const { generateProductInsight } = require('../services/analyticsService');
const { generateImpactNote } = require('../services/codexService');

const router = express.Router();

router.use(requireRole('merchant'));

function getMerchantId(req) {
  return Number(req.user.merchantId || 1);
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const data = await getMerchantDashboard(merchantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const sortBy = req.query.sortBy || 'mostReturns';
    const rows = await listMerchantProducts(merchantId, sortBy);

    res.json({ products: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:productId', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const productId = Number(req.params.productId);

    const detail = await getProductDetail(productId, merchantId);

    if (!detail.product) {
      return res.status(404).json({
        error: 'product_not_found'
      });
    }

    return res.json(detail);
  } catch (error) {
    return next(error);
  }
});

router.post('/products/:productId/generate-insight', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const productId = Number(req.params.productId);
    const threshold = req.body && req.body.threshold ? Number(req.body.threshold) : 10;

    const result = await generateProductInsight({
      productId,
      merchantId,
      threshold
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

async function createActionItemHandler(req, res, next) {
  try {
    const merchantId = getMerchantId(req);
    const insightId = Number(req.params.insightId);
    const { description, priority, estimatedImpactCents } = req.body || {};

    if (!description || !priority) {
      return res.status(400).json({ error: 'description_and_priority_required' });
    }

    const insight = await getInsightForMerchant(insightId, merchantId);

    if (!insight) {
      return res.status(404).json({ error: 'insight_not_found' });
    }

    const actionItem = await insertActionItem(insightId, insight.product_id, {
      description,
      priority,
      estimatedImpactCents
    });

    return res.status(201).json({ actionItem });
  } catch (error) {
    return next(error);
  }
}

router.post('/insights/:insightId/action-items', createActionItemHandler);
router.post('/insight/:insightId/action-items', createActionItemHandler);


router.get('/action-items', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const rows = await listActionItems(merchantId, {
      productId: req.query.productId,
      priority: req.query.priority,
      status: req.query.status,
      assignedTo: req.query.assignedTo
    });

    res.json({ actionItems: rows });
  } catch (error) {
    next(error);
  }
});

router.patch('/action-items/:actionItemId', async (req, res, next) => {
  try {
    const merchantId = getMerchantId(req);
    const actionItemId = Number(req.params.actionItemId);
    const updated = await updateActionItem(actionItemId, merchantId, {
      status: req.body.status,
      assignedTo: req.body.assignedTo,
      dueDate: req.body.dueDate
    });

    if (!updated) {
      return res.status(404).json({ error: 'action_item_not_found_or_empty_patch' });
    }

    if (updated && req.body.status === 'Completed' && !updated.impact_note) {
      try {
        const impact = await generateImpactNote({
          product: {
            id: updated.product_id,
            name: updated.product_name
          },
          actionItem: updated,
          insight: {
            title: updated.insight_title
          }
        });

        const withNote = await updateActionItem(actionItemId, merchantId, {
          impactNote: impact.impactNote
        });

        return res.json({ actionItem: withNote || updated });
      } catch (impactError) {
        console.warn('Impact note generation failed:', impactError.message);
        return res.json({ actionItem: updated });
      }
    }

    return res.json({ actionItem: updated });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
