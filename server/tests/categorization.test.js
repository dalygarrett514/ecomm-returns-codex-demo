const test = require('node:test');
const assert = require('node:assert/strict');
const { heuristicReturnAnalysis } = require('../services/codexService');

test('heuristic categorization detects sizing issues from reason text', () => {
  const analysis = heuristicReturnAnalysis(
    'The shoes run too narrow and I needed a half size up. They feel tight in the toe box.',
    null
  );

  assert.equal(analysis.category, 'sizing');
  assert.equal(analysis.sentiment, 'negative');
});

test('heuristic categorization respects explicit category hint', () => {
  const analysis = heuristicReturnAnalysis(
    'I changed my mind after ordering.',
    'not as described'
  );

  assert.equal(analysis.category, 'not_as_described');
});
