const test = require('node:test');
const assert = require('node:assert/strict');
const { synthesizePatternData } = require('../services/codexService');

test('pattern synthesis identifies dominant issue and priority', () => {
  const rows = [
    { category: 'sizing', severity: 'medium', unit_price_cents: 12000 },
    { category: 'sizing', severity: 'high', unit_price_cents: 12000 },
    { category: 'sizing', severity: 'medium', unit_price_cents: 12000 },
    { category: 'quality', severity: 'low', unit_price_cents: 12000 }
  ];

  const pattern = synthesizePatternData(rows);

  assert.equal(pattern.topCategory, 'sizing');
  assert.equal(pattern.topCount, 3);
  assert.equal(pattern.priority, 'Critical');
  assert.ok(pattern.potentialSavingsCents > 0);
});
