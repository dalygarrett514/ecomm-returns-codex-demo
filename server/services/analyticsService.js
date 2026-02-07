const {
  saveReturnAnalysis,
  markReturnProcessed,
  listReturnsForPatternDetection,
  insertInsight,
  getProductDetail
} = require('../repositories/ecommRepository');
const { analyzeReturnReason, detectPatterns, generateRecommendations } = require('./codexService');

async function processReturnAnalysis({ returnId, reasonText, categoryHint, product }) {
  const analysis = await analyzeReturnReason({ reasonText, categoryHint, product });

  await saveReturnAnalysis(returnId, analysis);
  await markReturnProcessed(returnId);

  return analysis;
}

async function generateProductInsight({ productId, merchantId, threshold }) {
  const effectiveThreshold = Number(process.env.INSIGHT_THRESHOLD || 5);
  const minReturns = Number.isFinite(threshold) ? Number(threshold) : effectiveThreshold;
  const detail = await getProductDetail(productId, merchantId);

  if (!detail.product) {
    return { skipped: true, reason: 'product_not_found' };
  }

  const rows = await listReturnsForPatternDetection(productId, merchantId);

  if (rows.length < minReturns) {
    return {
      skipped: true,
      reason: 'insufficient_returns',
      returnsAnalyzed: rows.length,
      threshold: minReturns
    };
  }

  const patternInsight = await detectPatterns({
    product: detail.product,
    returns: rows
  });

  const recommendationPack = await generateRecommendations({
    product: detail.product,
    patternInsight
  });

  const insightPayload = {
    title: patternInsight.title,
    description: patternInsight.description,
    priority: patternInsight.priority,
    confidence: patternInsight.confidence,
    estimatedSavingsCents: recommendationPack.estimatedSavingsCents,
    returnsAnalyzed: patternInsight.returnsAnalyzed,
    recommendations: recommendationPack.recommendations,
    sourcePattern: patternInsight.sourcePattern
  };

  const createdInsight = await insertInsight(productId, insightPayload);

  return {
    skipped: false,
    insightId: createdInsight.id,
    ...insightPayload
  };
}

module.exports = {
  processReturnAnalysis,
  generateProductInsight
};
