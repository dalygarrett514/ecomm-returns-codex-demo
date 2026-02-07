const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRecommendations } = require('../services/codexService');

test('recommendation parser normalizes malformed model output', () => {
  const fallback = {
    priority: 'High',
    recommendations: [
      { action: 'Fallback action', priority: 'High', estimatedImpactCents: 50000 }
    ],
    estimatedSavingsCents: 150000,
    confidence: 0.8
  };

  const parsed = parseRecommendations(
    {
      recommendations: [
        { action: 'Update fit chart', priority: 'Critical', estimatedImpactCents: 70000 },
        { action: '', priority: 'Low', estimatedImpactCents: 1000 }
      ],
      estimatedSavingsCents: 180000,
      confidence: 0.91
    },
    fallback
  );

  assert.equal(parsed.recommendations.length, 1);
  assert.equal(parsed.recommendations[0].priority, 'Critical');
  assert.equal(parsed.estimatedSavingsCents, 180000);
  assert.equal(parsed.confidence, 0.91);
});
