const config = require('../config');

const CATEGORY_KEYWORDS = {
  sizing: ['size', 'fit', 'tight', 'loose', 'narrow', 'wide', 'small', 'big'],
  quality: ['broken', 'defect', 'tear', 'ripped', 'peel', 'damaged', 'poor quality'],
  not_as_described: ['not as described', 'different', 'color', 'photo', 'material', 'expectation'],
  shipping_damage: ['shipping', 'box', 'arrived damaged', 'delivery damage'],
  changed_mind: ['changed my mind', 'no longer needed', 'do not want', 'impulse']
};

let openaiClient;

function getOpenAIClient() {
  if (!config.openai.apiKey) {
    return null;
  }

  if (!openaiClient) {
    const OpenAI = require('openai');
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }

  return openaiClient;
}

function normalizeCategory(label) {
  const normalized = String(label || '').toLowerCase().trim();

  if (normalized.includes('size') || normalized.includes('fit')) {
    return 'sizing';
  }

  if (normalized.includes('quality') || normalized.includes('defect') || normalized.includes('damage')) {
    return 'quality';
  }

  if (normalized.includes('describe') || normalized.includes('photo') || normalized.includes('expect')) {
    return 'not_as_described';
  }

  if (normalized.includes('ship')) {
    return 'shipping_damage';
  }

  if (normalized.includes('mind')) {
    return 'changed_mind';
  }

  return normalized || 'other';
}

function detectCategoryByKeyword(text = '') {
  const lower = text.toLowerCase();
  let bestCategory = 'other';
  let bestMatches = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matches = keywords.reduce((count, keyword) => (lower.includes(keyword) ? count + 1 : count), 0);

    if (matches > bestMatches) {
      bestCategory = category;
      bestMatches = matches;
    }
  }

  return bestCategory;
}

function heuristicReturnAnalysis(reasonText, categoryHint) {
  const lowerReason = String(reasonText || '').toLowerCase();
  const category = categoryHint ? normalizeCategory(categoryHint) : detectCategoryByKeyword(lowerReason);

  const severity =
    /unsafe|injury|dangerous|completely broken|fell apart/i.test(reasonText) ? 'high' : /broken|defect|peel|damaged|bad/i.test(reasonText) ? 'medium' : 'low';

  const sentiment = /love|great|good/i.test(reasonText) ? 'neutral' : 'negative';

  return {
    category,
    sentiment,
    severity,
    confidence: 0.68,
    summary: `Likely ${category.replace('_', ' ')} return based on customer narrative.`
  };
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (error) {
        return null;
      }
    }

    return null;
  }
}

function parseReturnAnalysis(input, fallback) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  return {
    category: normalizeCategory(input.category || fallback.category),
    sentiment: ['negative', 'neutral', 'positive'].includes(input.sentiment) ? input.sentiment : fallback.sentiment,
    severity: ['low', 'medium', 'high', 'critical'].includes(input.severity) ? input.severity : fallback.severity,
    confidence: Number(input.confidence || fallback.confidence || 0.5),
    summary: String(input.summary || fallback.summary)
  };
}

async function callCodexJson(systemPrompt, userPayload, fallbackValue) {
  const client = getOpenAIClient();

  if (!client) {
    console.warn('[codex] client not configured, using fallback');
    return fallbackValue;
  }

  try {
    const response = await client.responses.create({
      model: config.openai.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(userPayload) }]
        }
      ]
    });

    const text = response.output_text;
    const parsed = safeJsonParse(text);

    if (!parsed) {
      console.warn('[codex] response parse failed, using fallback');
      return fallbackValue;
    }

    return parsed;
  } catch (error) {
    console.warn('[codex] request failed, using fallback', error?.message || error);
    return fallbackValue;
  }
}

async function analyzeReturnReason(payload) {
  console.log('[codex] analyzeReturnReason:start', { product: payload.product?.name });
  const fallback = heuristicReturnAnalysis(payload.reasonText, payload.categoryHint);

  const modelOutput = await callCodexJson(
    'You are Codex embedded in an eCommerce returns API. Categorize a single return reason. Respond in strict JSON with keys category, sentiment, severity, confidence, summary.',
    {
      reasonText: payload.reasonText,
      categoryHint: payload.categoryHint,
      product: payload.product
    },
    fallback
  );

  const parsed = parseReturnAnalysis(modelOutput, fallback);
  console.log('[codex] analyzeReturnReason:done');
  return parsed;
}

function synthesizePatternData(rows = []) {
  const counts = {};
  let highSeverityCount = 0;
  let totalOrderValueCents = 0;

  rows.forEach((row) => {
    const category = normalizeCategory(row.category || detectCategoryByKeyword(row.reason_text || ''));
    counts[category] = (counts[category] || 0) + 1;
    totalOrderValueCents += Number(row.unit_price_cents || 0);

    if (String(row.severity || '').toLowerCase() === 'high' || String(row.severity || '').toLowerCase() === 'critical') {
      highSeverityCount += 1;
    }
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = rows.length;
  const [topCategory, topCount] = sorted[0] || ['other', 0];
  const topShare = total === 0 ? 0 : Number((topCount / total).toFixed(2));

  const priority =
    topShare >= 0.6 || highSeverityCount >= 5 ? 'Critical' : topShare >= 0.45 ? 'High' : topShare >= 0.3 ? 'Medium' : 'Low';

  const potentialSavingsCents = Math.round(totalOrderValueCents * Math.min(0.35, 0.1 + topShare / 2));

  return {
    totalReturns: total,
    topCategory,
    topCount,
    topShare,
    priority,
    highSeverityCount,
    potentialSavingsCents,
    categoryCounts: sorted.map(([category, count]) => ({ category, count }))
  };
}

function parsePatternInsight(input, fallback) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const parsedSource = input.sourcePattern && typeof input.sourcePattern === 'object' ? input.sourcePattern : fallback.sourcePattern;
  const parsedConfidence = Number.isFinite(Number(input.confidence))
    ? Number(input.confidence)
    : Number(fallback.confidence || 0.7);

  return {
    title: String(input.title || fallback.title),
    description: String(input.description || fallback.description),
    priority: ['Critical', 'High', 'Medium', 'Low'].includes(input.priority) ? input.priority : fallback.priority,
    confidence: parsedConfidence,
    returnsAnalyzed: Number(input.returnsAnalyzed || fallback.returnsAnalyzed || 0),
    sourcePattern: parsedSource,
    estimatedSavingsCents: Number(input.estimatedSavingsCents || fallback.estimatedSavingsCents || 0)
  };
}

async function detectPatterns(payload) {
  console.log('[codex] detectPatterns:start', { product: payload.product?.name, returns: payload.returns?.length });
  const baseline = synthesizePatternData(payload.returns);

  const fallback = {
    title: `${Math.round(baseline.topShare * 100)}% of returns linked to ${baseline.topCategory.replace('_', ' ')} issues`,
    description: `Analysis of ${baseline.totalReturns} returns indicates concentrated ${baseline.topCategory.replace('_', ' ')} friction for this product.`,
    priority: baseline.priority,
    confidence: 0.79,
    returnsAnalyzed: baseline.totalReturns,
    sourcePattern: baseline,
    estimatedSavingsCents: baseline.potentialSavingsCents
  };

  const modelOutput = await callCodexJson(
    'You are Codex embedded in an eCommerce analytics backend. Detect patterns across returns and output strict JSON with title, description, priority, confidence, returnsAnalyzed, sourcePattern, estimatedSavingsCents.',
    {
      product: payload.product,
      returns: payload.returns.map((row) => ({
        reasonText: row.reason_text,
        category: row.category,
        severity: row.severity,
        unitPriceCents: row.unit_price_cents
      }))
    },
    fallback
  );

  const parsed = parsePatternInsight(modelOutput, fallback);
  console.log('[codex] detectPatterns:done');
  return parsed;
}

function defaultRecommendationsFromPattern(pattern) {
  const topCategory = normalizeCategory(pattern.sourcePattern && pattern.sourcePattern.topCategory ? pattern.sourcePattern.topCategory : 'other');
  const priority = pattern.priority || 'Medium';
  const baseImpact = Math.max(50000, Math.round((pattern.estimatedSavingsCents || 0) / 3));
  const impactFor = (index) => Math.max(15000, Math.round(baseImpact * (1.2 - index * 0.15)));

  if (topCategory === 'sizing') {
    return [
      {
        action: "Update size chart to call out fit tendency (e.g. 'runs narrow; size up 0.5').",
        priority,
        estimatedImpactCents: impactFor(0)
      },
      {
        action: 'Add additional fit photography and side profile images to product detail page.',
        priority,
        estimatedImpactCents: impactFor(1)
      },
      {
        action: 'Introduce wide-fit variant based on repeat sizing complaints.',
        priority,
        estimatedImpactCents: impactFor(2)
      }
    ];
  }

  if (topCategory === 'quality') {
    return [
      {
        action: 'Escalate defect cluster to supplier QA with defect examples and return IDs.',
        priority,
        estimatedImpactCents: impactFor(0)
      },
      {
        action: 'Add inbound quality checkpoint for vulnerable components before fulfillment.',
        priority,
        estimatedImpactCents: impactFor(1)
      },
      {
        action: 'Refresh product description to set realistic durability expectations.',
        priority,
        estimatedImpactCents: impactFor(2)
      }
    ];
  }

  return [
    {
      action: 'Run PDP content update experiment to better align customer expectations before purchase.',
      priority,
      estimatedImpactCents: impactFor(0)
    },
    {
      action: 'Create post-purchase fit/use guidance email to reduce avoidable returns.',
      priority,
      estimatedImpactCents: impactFor(1)
    },
    {
      action: 'Monitor weekly return trend and alert if category share exceeds threshold.',
      priority,
      estimatedImpactCents: impactFor(2)
    }
  ];
}

function parseRecommendations(input, fallback) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const recommendations = Array.isArray(input.recommendations)
    ? input.recommendations.map((item) => ({
        action: String(item.action || ''),
        priority: ['Critical', 'High', 'Medium', 'Low'].includes(item.priority) ? item.priority : fallback.priority,
        estimatedImpactCents: Number(item.estimatedImpactCents || 0)
      }))
    : fallback.recommendations;

  return {
    ...fallback,
    recommendations: recommendations.filter((item) => item.action),
    estimatedSavingsCents: Number(input.estimatedSavingsCents || fallback.estimatedSavingsCents),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : Number(fallback.confidence || 0.7)
  };
}

function parseImpactNote(input, fallback) {
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  return {
    impactNote: String(input.impactNote || fallback.impactNote || '')
  };
}

async function generateRecommendations(payload) {
  console.log('[codex] generateRecommendations:start', { product: payload.product?.name });
  const fallbackRecommendations = defaultRecommendationsFromPattern(payload.patternInsight);
  const fallback = {
    recommendations: fallbackRecommendations,
    estimatedSavingsCents: payload.patternInsight.estimatedSavingsCents,
    confidence: payload.patternInsight.confidence
  };

  const modelOutput = await callCodexJson(
    'You are Codex embedded in an eCommerce product ops workflow. Generate 3 actionable recommendations from return patterns. Output strict JSON: recommendations (array of {action, priority, estimatedImpactCents}), estimatedSavingsCents, confidence. The estimatedImpactCents must be a dollar impact in cents, should differ across recommendations, and be grounded in the pattern data and unit prices.',
    {
      product: payload.product,
      patternInsight: payload.patternInsight
    },
    fallback
  );

  const parsed = parseRecommendations(modelOutput, fallback);
  console.log('[codex] generateRecommendations:done');
  return parsed;
}

async function generateImpactNote(payload) {
  console.log('[codex] generateImpactNote:start', { product: payload.product?.name, action: payload.actionItem?.description });
  const fallback = {
    impactNote: `Completed action is expected to reduce returns by 6% and save ${payload.actionItem?.estimated_impact_cents ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payload.actionItem.estimated_impact_cents / 100) : '$0'} next quarter.`
  };

  const modelOutput = await callCodexJson(
    'You are Codex embedded in an eCommerce product ops workflow. Write a 1-2 sentence impact note about the completed action with a concrete estimated outcome (percent return reduction and/or dollars saved). Output strict JSON: {impactNote}.',
    {
      product: payload.product,
      actionItem: payload.actionItem,
      insight: payload.insight
    },
    fallback
  );

  const parsed = parseImpactNote(modelOutput, fallback);
  console.log('[codex] generateImpactNote:done');
  return parsed;
}

module.exports = {
  analyzeReturnReason,
  detectPatterns,
  generateRecommendations,
  heuristicReturnAnalysis,
  synthesizePatternData,
  parseRecommendations,
  generateImpactNote
};
