import React, { useEffect, useMemo, useState } from 'react';

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format((cents || 0) / 100);
}

function formatDate(dateValue) {
  if (!dateValue) {
    return '-';
  }

  return new Date(dateValue).toLocaleDateString();
}

export default function CustomerPortal({ api }) {
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [activeTab, setActiveTab] = useState('orders');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [message, setMessage] = useState('');
  const [submittedOrderItems, setSubmittedOrderItems] = useState(() => new Set());

  async function loadData() {
    setLoading(true);

    try {
      const [ordersResult, returnsResult] = await Promise.all([api.getCustomerOrders(), api.getCustomerReturns()]);
      setOrders(ordersResult.orders || []);
      const returnsList = returnsResult.returns || [];
      setReturns(returnsList);
      setSubmittedOrderItems(new Set(returnsList.map((entry) => entry.order_item_id)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setMessage('');
  }, [activeTab]);

  const totalEligibleItems = useMemo(
    () =>
      orders.reduce((count, order) => {
        if (order.status !== 'delivered') {
          return count;
        }
        const eligibleItems = order.items.filter((item) => !submittedOrderItems.has(item.orderItemId)).length;
        return count + eligibleItems;
      }, 0),
    [orders, submittedOrderItems]
  );

  async function handleSubmitReturn(event) {
    event.preventDefault();

    if (!selectedItem || reasonText.trim().length < 10) {
      setMessage('Please select an item and provide a clear return reason.');
      return;
    }

    setSubmitting(true);
    setMessage('Analyzing your feedback...');

    try {
      await api.submitReturn({
        orderItemId: selectedItem.orderItemId,
        reasonText
      });

      setSelectedItem(null);
      setReasonText('');
      setMessage("Return submitted! We've processed your request.");
      setSubmittedOrderItems((prev) => {
        const next = new Set(prev);
        next.add(selectedItem.orderItemId);
        return next;
      });
      await loadData();
      setActiveTab('returns');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="panel">Loading customer data...</div>;
  }

  return (
    <section className="panel stack-gap-lg">
      <div className="customer-summary">
        <h2>lululemon Guest Returns</h2>
        <p>{totalEligibleItems} delivered items eligible for returns.</p>
      </div>

      <div className="tabs">
        <button type="button" className={activeTab === 'orders' ? 'tab active' : 'tab'} onClick={() => setActiveTab('orders')}>
          My Orders
        </button>
        <button type="button" className={activeTab === 'returns' ? 'tab active' : 'tab'} onClick={() => setActiveTab('returns')}>
          My Returns
        </button>
      </div>

      {activeTab === 'orders' && (
        <div className="stack-gap-md">
          {orders.map((order) => (
            <article key={order.id} className="card">
                  <header className="card-header">
                    <div>
                      <h3>Order #{order.id}</h3>
                      <p>{order.status === 'delivered' ? `Delivered ${formatDate(order.deliveredAt)}` : `Status: ${order.status.replace('_', ' ')}`}</p>
                    </div>
                  </header>

              <div className="stack-gap-sm">
                {order.items.map((item) => (
                  <div key={item.orderItemId} className="order-row">
                    <img src={item.product.imageUrl} alt={item.product.name} />
                    <div className="order-meta">
                      <strong>{item.product.name}</strong>
                      <span>{item.product.sku}</span>
                      <span>{formatCurrency(item.unitPriceCents)}</span>
                    </div>
                    <button
                      type="button"
                      className="action-button"
                      onClick={() => setSelectedItem(item)}
                      disabled={order.status !== 'delivered' || submittedOrderItems.has(item.orderItemId)}
                    >
                      {submittedOrderItems.has(item.orderItemId)
                        ? 'Processing'
                        : order.status === 'delivered'
                        ? 'Return Item'
                        : 'Not eligible yet'}
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {activeTab === 'returns' && (
        <div className="stack-gap-sm">
          {message && <div className="status-message">{message}</div>}
          {returns.length === 0 && <div className="card">No returns yet.</div>}
          {returns.map((entry) => (
            <article key={entry.id} className="card return-card">
              <div className="return-item">
                <img src={entry.image_url} alt={entry.product_name} />
                <div>
                  <h3>{entry.product_name}</h3>
                  <p>{entry.reason_text}</p>
                </div>
              </div>
              <div className="return-meta">
                <span>{formatDate(entry.submitted_at)}</span>
                <span className="badge muted">{entry.status === 'processed' ? 'processing' : entry.status}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedItem && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Return item form">
          <form className="return-form modal-card" onSubmit={handleSubmitReturn}>
            <div className="modal-header">
              <div>
                <p className="insight-label">Return request</p>
                <h3>Return: {selectedItem.product.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>

            <img src={selectedItem.product.imageUrl} alt={selectedItem.product.name} className="return-form-image" />

            <label htmlFor="reasonText">Please tell us why you're returning this item</label>
            <textarea
              id="reasonText"
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              rows={5}
              placeholder="Example: The shoe runs narrow and caused discomfort after 20 minutes of walking."
              required
            />


            <div className="form-actions">
              <button type="submit" className="action-button" disabled={submitting || reasonText.trim().length < 10}>
                {submitting ? 'Analyzing your feedback...' : 'Submit Return'}
              </button>
              <button type="button" className="ghost-button" onClick={() => setSelectedItem(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab !== 'returns' && message && <div className="status-message">{message}</div>}
    </section>
  );
}
