import React, { useEffect, useMemo, useState } from 'react';

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function formatPercent(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleDateString();
}

function TrendChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!points || points.length === 0) {
    return <div className="empty-state">No trend data</div>;
  }
  const max = Math.max(...points.map((item) => Number(item.returns || 0)), 1);
  const width = 600;
  const height = 170;
  const padding = { top: 8, right: 8, bottom: 24, left: 28 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const positions = points.map((item, index) => {
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * chartWidth;
    const y = padding.top + chartHeight - (Number(item.returns || 0) / max) * chartHeight;
    return { x, y, item };
  });

  const polyline = positions.map((pos) => `${pos.x},${pos.y}`).join(' ');

  const axisY = [
    { value: max, y: padding.top },
    { value: 0, y: padding.top + chartHeight }
  ];

  const axisX = [
    { label: 'Start', x: padding.left },
    { label: 'Today', x: padding.left + chartWidth - 10 }
  ];

  const activePoint = hoverIndex != null ? positions[hoverIndex] : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="trend-svg"
      role="img"
      aria-label="Returns trend chart"
      onMouseLeave={() => setHoverIndex(null)}
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const scaleX = width / bounds.width;
        const x = (event.clientX - bounds.left) * scaleX;
        const ratio = (x - padding.left) / chartWidth;
        const index = Math.round(ratio * (points.length - 1));
        const clamped = Math.max(0, Math.min(points.length - 1, index));
        setHoverIndex(clamped);
      }}
    >
      <g className="trend-axes">
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} />
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={padding.left + chartWidth}
          y2={padding.top + chartHeight}
        />
        {axisY.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line x1={padding.left - 4} y1={tick.y} x2={padding.left} y2={tick.y} />
            <text x={padding.left - 8} y={tick.y + 4} textAnchor="end">
              {tick.value}
            </text>
          </g>
        ))}
        {axisX.map((tick) => (
          <text key={tick.label} x={tick.x} y={padding.top + chartHeight + 18} textAnchor="middle">
            {tick.label}
          </text>
        ))}
      </g>
      <polyline fill="none" stroke="currentColor" strokeWidth="3" points={polyline} />
      {activePoint && (
        <g className="trend-tooltip">
          <line
            x1={activePoint.x}
            y1={padding.top}
            x2={activePoint.x}
            y2={padding.top + chartHeight}
            stroke="var(--line)"
            strokeDasharray="3 3"
          />
          <circle cx={activePoint.x} cy={activePoint.y} r="4" fill="currentColor" />
          <rect x={activePoint.x - 44} y={padding.top + 6} width="88" height="26" rx="7" />
          <text x={activePoint.x} y={padding.top + 18} textAnchor="middle">
            {new Date(activePoint.item.day).toLocaleDateString()}
          </text>
          <text x={activePoint.x} y={padding.top + 28} textAnchor="middle">
            {activePoint.item.returns}
          </text>
        </g>
      )}
    </svg>
  );
}

function ConfidenceBar({ confidence }) {
  const percent = Math.max(0, Math.min(100, Math.round((confidence || 0) * 100)));

  return (
    <div className="confidence-block">
      <span>Confidence: {percent}%</span>
      <div className="confidence-track">
        <span className="confidence-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function CategoryBreakdown({ returnsRows }) {
  const data = useMemo(() => {
    const counts = {};

    returnsRows.forEach((entry) => {
      const key = entry.category || 'uncategorized';
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts).map(([category, count]) => ({ category, count }));
  }, [returnsRows]);

  if (data.length === 0) {
    return <div className="card">No category data yet.</div>;
  }

  const total = data.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="card stack-gap-sm">
      <h3>AI Category Breakdown</h3>
      {data.map((entry) => (
        <div key={entry.category} className="breakdown-row">
          <span className="breakdown-count">{entry.count}</span>
          <span className="badge muted">{entry.category}</span>
          <div className="breakdown-bar">
            <span style={{ width: `${(entry.count / total) * 100}%` }} />
          </div>
          <span className="breakdown-percent">{Math.round((entry.count / total) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function MerchantPortal({ api }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [products, setProducts] = useState([]);
  const [sortBy, setSortBy] = useState('mostReturns');
  const [productsQuery, setProductsQuery] = useState('');
  const [trendRange, setTrendRange] = useState(30);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productDetail, setProductDetail] = useState(null);
  const [actionItems, setActionItems] = useState([]);
  const [pendingInsight, setPendingInsight] = useState(null);
  const [creatingAction, setCreatingAction] = useState(null);
  const [addedActions, setAddedActions] = useState(() => new Set());
  const [showInsightModal, setShowInsightModal] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [expandedReturnId, setExpandedReturnId] = useState(null);
  const [insightNotice, setInsightNotice] = useState('');
  const [whatIfReduction, setWhatIfReduction] = useState(10);
  const [filters, setFilters] = useState({
    query: '',
    priority: '',
    status: '',
    assignedTo: ''
  });
  const [loadingState, setLoadingState] = useState('loading');
  const [message, setMessage] = useState('');

  const statusThresholds = useMemo(() => {
    if (!products.length) {
      return { yellow: 0, red: 0 };
    }

    const scores = products
      .map((product) => {
        const returnRate = Number(product.return_rate || 0);
        const totalReturns = Number(product.total_returns || 0);
        return returnRate * 100 + totalReturns;
      })
      .sort((a, b) => a - b);

    const yellowIndex = Math.floor(scores.length * 0.33);
    const redIndex = Math.floor(scores.length * 0.66);

    return {
      yellow: scores[yellowIndex] ?? 0,
      red: scores[redIndex] ?? 0
    };
  }, [products]);

  async function loadDashboard() {
    const data = await api.getDashboard();
    setDashboard(data);
  }

  async function loadProducts() {
    const data = await api.getProducts(sortBy);
    setProducts(data.products || []);

    if (!selectedProductId && data.products && data.products[0]) {
      setSelectedProductId(data.products[0].product_id);
    }
  }

  async function loadActionItems(currentFilters = filters) {
    const data = await api.getActionItems(currentFilters);
    setActionItems(data.actionItems || []);
  }

  async function loadInitial() {
    try {
      setLoadingState('loading');
      await Promise.all([loadDashboard(), loadProducts(), loadActionItems()]);
      setLoadingState('ready');
    } catch (error) {
      setLoadingState('error');
      setMessage(error.message);
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      api
        .getProductDetail(selectedProductId)
        .then((data) => setProductDetail(data))
        .catch((error) => setMessage(error.message));
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadProducts().catch((error) => setMessage(error.message));
  }, [sortBy]);

  async function handleGenerateInsight() {
    if (!selectedProductId) {
      return;
    }

    setShowInsightModal(true);
    setInsightLoading(true);
    setInsightNotice('');
    setWhatIfReduction(10);
    setMessage('Running Codex pattern detection and recommendation generation...');

    try {
      const result = await api.generateInsight(selectedProductId);

      if (result.skipped) {
        setMessage(`Insight generation skipped: ${result.reason}.`);
      } else {
      setMessage('New AI insight generated. Select the actions to create.');
      setInsightNotice('New AI insight generated. Select the actions to create.');
        setPendingInsight(result);
      }

      const detail = await api.getProductDetail(selectedProductId);
      setProductDetail(detail);
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setInsightLoading(false);
    }
  }

  async function updateItem(item, patch) {
    try {
      await api.updateActionItem(item.id, patch);
      await loadActionItems();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createActionFromRecommendation(recommendation) {
    const insightId = pendingInsight && pendingInsight.insightId ? pendingInsight.insightId : productDetail?.latestInsight?.id;

    if (!insightId) {
      setMessage('Generate an insight before adding action items.');
      return;
    }

    const actionKey = `${insightId}:${recommendation.action}`;
    if (addedActions.has(actionKey)) {
      return;
    }

    setCreatingAction(recommendation.action);

    try {
      await api.createActionItem(insightId, {
        description: recommendation.action,
        priority: recommendation.priority,
        estimatedImpactCents: recommendation.estimatedImpactCents
      });

      await loadActionItems();
      setAddedActions((prev) => {
        const next = new Set(prev);
        next.add(actionKey);
        return next;
      });
      setMessage('Action item added to the queue.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCreatingAction(null);
    }
  }

  // Action plan feature removed.

  if (loadingState === 'loading') {
    return <div className="panel">Loading merchant analytics...</div>;
  }

  if (loadingState === 'error') {
    return <div className="panel">Failed to load merchant data: {message}</div>;
  }

  return (
    <section className="panel stack-gap-lg">
      <header className="merchant-header">
        <h2>lululemon Return Intelligence Dashboard</h2>
        <p>Codex highlights return patterns and proposed fixes across top sellers.</p>
      </header>

      <div className="tabs">
        <button type="button" className={activeTab === 'dashboard' ? 'tab active' : 'tab'} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button type="button" className={activeTab === 'products' ? 'tab active' : 'tab'} onClick={() => setActiveTab('products')}>
          Returns
        </button>
        <button type="button" className={activeTab === 'actions' ? 'tab active' : 'tab'} onClick={() => setActiveTab('actions')}>
          Action Items
        </button>
      </div>

      {activeTab === 'dashboard' && dashboard && (
        <div className="stack-gap-md">
          <div className="metric-grid">
            <article className="metric-card">
              <h3>Total Returns</h3>
              <strong>{dashboard.metrics.totalReturns}</strong>
            </article>
            <article className="metric-card">
              <h3>Return Rate</h3>
              <strong>{formatPercent(dashboard.metrics.returnRate)}</strong>
            </article>
            <article className="metric-card">
              <h3>Cost of Returns</h3>
              <strong>{formatCurrency(dashboard.metrics.costOfReturnsCents)}</strong>
            </article>
            <article className="metric-card">
              <h3>AI Insights Generated</h3>
              <strong>{dashboard.metrics.aiInsightsGenerated}</strong>
            </article>
          </div>

          <article className="card">
            <h3>Top Issues</h3>
            <div className="badge-row">
              {dashboard.topIssues.map((issue) => (
                <span key={issue.category} className="badge">
                  {issue.count} {issue.category}
                </span>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="table-controls">
              <h3>Returns Trend</h3>
              <select
                value={trendRange}
                onChange={(event) => setTrendRange(Number(event.target.value))}
                aria-label="Date range"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </div>
            <TrendChart points={(dashboard.trend || []).slice(-trendRange)} />
          </article>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="stack-gap-md">
          <div className="table-controls">
            <label htmlFor="sortBy">Sort by</label>
            <select id="sortBy" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="mostReturns">Most returns</option>
              <option value="costImpact">Highest cost impact</option>
              <option value="newestIssues">Newest issues</option>
            </select>
            <input
              className="search-input"
              type="search"
              placeholder="Search products..."
              value={productsQuery}
              onChange={(event) => setProductsQuery(event.target.value)}
            />
          </div>

          <div className="product-layout">
            <div className="product-list-panel">
              <div className="table-wrapper scroll-table">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Returns</th>
                      <th>Category Breakdown</th>
                      <th>Return Rate</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products
                      .filter((product) => {
                        const query = productsQuery.trim().toLowerCase();
                        if (!query) return true;
                        return (
                          product.name.toLowerCase().includes(query) ||
                          product.sku.toLowerCase().includes(query)
                        );
                      })
                      .map((product) => {
                      const totalReturns = Number(product.total_returns);
                      const returnRate = Number(product.return_rate);
                      const score = returnRate * 100 + totalReturns;
                      const status =
                        score >= statusThresholds.red
                          ? 'Red'
                          : score >= statusThresholds.yellow
                          ? 'Yellow'
                          : 'Green';
                      const statusClass = (status || 'Green').toLowerCase();

                      return (
                        <tr key={product.product_id} className={`status-row status-${statusClass}`}>
                          <td>
                            <div className="product-cell">
                              <img src={product.image_url} alt={product.name} />
                              <div>
                                <strong>{product.name}</strong>
                                <p>{product.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td>{product.total_returns}</td>
                          <td>
                            <div className="badge-row">
                              {(product.category_breakdown || []).map((item) => (
                                <span key={`${product.product_id}-${item.category}`} className="badge muted">
                                  {item.count} {item.category}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>{formatPercent(product.return_rate)}</td>
                          <td>
                            <span className={`status-pill status-${statusClass}`} aria-label={`Status ${statusClass}`} />
                          </td>
                          <td>
                            <button type="button" className="action-button" onClick={() => setSelectedProductId(product.product_id)}>
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="detail-panel">
              {productDetail ? (
                <article className="detail-layout">
                  <header className="detail-header">
                    <img src={productDetail.product.image_url} alt={productDetail.product.name} />
                    <div>
                      <h3>{productDetail.product.name}</h3>
                      <p>{productDetail.product.sku}</p>
                    </div>
                    <button type="button" className="action-button" onClick={handleGenerateInsight}>
                      Generate Report
                    </button>
                  </header>

                  <div className="table-wrapper scroll-detail">
                    <table className="fixed-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Customer</th>
                          <th>Return Reason</th>
                          <th>AI Category</th>
                          <th className="severity-col">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productDetail.returns.map((entry) => (
                          <tr
                            key={entry.id}
                            className={`return-row ${expandedReturnId === entry.id ? 'is-expanded' : ''}`}
                            onClick={() =>
                              setExpandedReturnId(expandedReturnId === entry.id ? null : entry.id)
                            }
                          >
                            <td>{formatDate(entry.submitted_at)}</td>
                            <td>{entry.customer_name || entry.customer_sub}</td>
                            <td className="return-reason-cell" title={entry.reason_text}>
                              {entry.reason_text}
                            </td>
                            <td>{entry.category || 'pending'}</td>
                            <td className="severity-col">{entry.severity || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <CategoryBreakdown returnsRows={productDetail.returns} />

                  {showInsightModal && (
                    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="AI Insight report">
                      <div className="modal-card">
                        <div className="modal-header">
                          <div>
                            <p className="insight-label">AI Insight Report</p>
                            <h3>{productDetail?.product?.name || 'Insight Report'}</h3>
                          </div>
                          <button type="button" className="ghost-button" onClick={() => setShowInsightModal(false)}>
                            Close
                          </button>
                        </div>

                        {insightNotice && (
                          <div className="status-message">{insightNotice}</div>
                        )}

                        {insightLoading && (
                          <div className="loading-row">
                            <span className="spinner" aria-hidden="true" />
                            <span>Generating insight...</span>
                          </div>
                        )}

                        {!insightLoading && !productDetail?.latestInsight && (
                          <div className="empty-state">No insight available yet.</div>
                        )}

                        {productDetail?.latestInsight && insightNotice && (
                          <div className="insight-layout">
                            <article className="insight-card">
                              <div className="insight-header-row">
                                <div>
                                  <h3>{productDetail.latestInsight.title}</h3>
                                  <p>{productDetail.latestInsight.description}</p>
                                </div>
                              </div>

                              <div className="whatif-card">
                                <div className="whatif-header">
                                  <p className="insight-label">What-if Savings</p>
                                  <span>{whatIfReduction}% return rate reduction</span>
                                </div>
                              <input
                                type="range"
                                min="2"
                                max="25"
                                value={whatIfReduction}
                                onChange={(event) => setWhatIfReduction(Number(event.target.value))}
                              />
                              <div className="whatif-value">
                                Projected quarterly savings:{' '}
                                <strong>
                                  {formatCurrency(
                                    Math.round(
                                      (productDetail.latestInsight.estimated_savings_cents || 0) * (whatIfReduction / 10)
                                    )
                                  )}
                                </strong>
                              </div>
                              <p className="whatif-note">Assumes base savings corresponds to a 10% return reduction.</p>
                            </div>

                            <div className="recommendation-list">
                              {(productDetail.latestInsight.recommendations || [])
                                .filter((rec) => {
                                  const insightId = pendingInsight?.insightId || productDetail.latestInsight?.id;
                                  if (!insightId) return true;
                                  return !addedActions.has(`${insightId}:${rec.action}`);
                                })
                                .map((rec) => (
                                <div key={rec.action} className="recommendation-item">
                                  <div>
                                    <strong>{rec.action}</strong>
                                    <p>Priority: {rec.priority} · Est. impact {formatCurrency(rec.estimatedImpactCents)}</p>
                                  </div>
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    disabled={creatingAction === rec.action}
                                    onClick={() => createActionFromRecommendation(rec)}
                                  >
                                    {creatingAction === rec.action ? 'Adding...' : 'Add Action'}
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="button-row">
                              <button type="button" className="action-button" onClick={() => setActiveTab('actions')}>
                                View Action Items
                              </button>
                              <button type="button" className="ghost-button" onClick={handleGenerateInsight}>
                                Refresh Insight
                              </button>
                            </div>
                          </article>

                            {(() => {
                              const sourcePattern = productDetail.latestInsight.source_pattern || productDetail.latestInsight.sourcePattern;
                              const samples = (productDetail.returns || []).slice(0, 2).map((row) => row.reason_text);
                              if (!sourcePattern) return null;
                              return (
                                <aside className="trace-panel">
                                  <p className="insight-label">Codex Decision Trace</p>
                                  <div className="trace-hero-grid">
                                    <div>
                                      <span>Top category</span>
                                      <strong>{sourcePattern.topCategory}</strong>
                                      <p>{Math.round((sourcePattern.topShare || 0) * 100)}% share</p>
                                    </div>
                                    <div>
                                      <span>Returns analyzed</span>
                                      <strong>{sourcePattern.totalReturns}</strong>
                                      <p>High severity: {sourcePattern.highSeverityCount}</p>
                                    </div>
                                    <div>
                                      <span>Potential savings</span>
                                      <strong>{formatCurrency(sourcePattern.potentialSavingsCents || 0)}</strong>
                                      <p>Confidence: {Math.round((productDetail.latestInsight.confidence || 0) * 100)}%</p>
                                    </div>
                                  </div>
                                  {samples.length > 0 && (
                                    <div className="trace-samples">
                                      <strong>Sample feedback</strong>
                                      {samples.map((text, idx) => (
                                        <p key={`sample-${idx}`}>{text}</p>
                                      ))}
                                    </div>
                                  )}
                                </aside>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ) : (
                <div className="card">Select a product to see details.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="stack-gap-md">
          <div className="filters-row">
            <input
              className="search-input"
              type="search"
              placeholder="Search product or action..."
              value={filters.query}
              onChange={(event) => {
                const next = { ...filters, query: event.target.value };
                setFilters(next);
              }}
            />

            <select
              value={filters.priority}
              onChange={(event) => {
                const next = { ...filters, priority: event.target.value };
                setFilters(next);
                loadActionItems(next).catch((error) => setMessage(error.message));
              }}
            >
              <option value="">All priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            <select
              value={filters.status}
              onChange={(event) => {
                const next = { ...filters, status: event.target.value };
                setFilters(next);
                loadActionItems(next).catch((error) => setMessage(error.message));
              }}
            >
              <option value="">All statuses</option>
              <option value="New">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Action</th>
                  <th>Estimated Impact</th>
                  <th>Status</th>
                  <th>Assign</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {actionItems
                  .filter((item) => {
                    const query = filters.query.trim().toLowerCase();
                    if (!query) return true;
                    return (
                      item.product_name.toLowerCase().includes(query) ||
                      item.description.toLowerCase().includes(query)
                    );
                  })
                  .map((item) => (
                  <tr key={item.id} className={item.status === 'Completed' ? 'status-row status-green' : ''}>
                    <td>
                      <div className="product-cell">
                        <img src={item.image_url} alt={item.product_name} />
                        <div>
                          <strong>{item.product_name}</strong>
                          <p>{item.priority}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="action-desc">
                        <span>{item.description}</span>
                        {item.impact_note && (
                          <em className={item.status === 'Completed' ? 'impact-note completed' : 'impact-note'}>
                            {item.impact_note}
                          </em>
                        )}
                      </div>
                    </td>
                    <td>{formatCurrency(item.estimated_impact_cents)}</td>
                    <td>
                      <select
                        value={item.status}
                        onChange={(event) =>
                          updateItem(item, {
                            status: event.target.value,
                            assignedTo: item.assigned_to,
                            dueDate: item.due_date
                          })
                        }
                      >
                        <option value="New">New</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={item.assigned_to || ''}
                        onChange={(event) =>
                          updateItem(item, {
                            status: item.status,
                            assignedTo: event.target.value,
                            dueDate: item.due_date
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        <option value="alex@company.com">Alex</option>
                        <option value="morgan@company.com">Morgan</option>
                        <option value="sam@company.com">Sam</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        value={item.due_date ? new Date(item.due_date).toISOString().slice(0, 10) : ''}
                        onChange={(event) =>
                          updateItem(item, {
                            status: item.status,
                            assignedTo: item.assigned_to,
                            dueDate: event.target.value
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </section>
  );
}
