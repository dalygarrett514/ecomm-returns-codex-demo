CREATE TABLE IF NOT EXISTS merchants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  image_url TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_sub TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'delivered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  customer_sub TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  category_hint TEXT,
  photo_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_ai_analysis (
  id SERIAL PRIMARY KEY,
  return_id INTEGER NOT NULL UNIQUE REFERENCES returns(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  summary TEXT NOT NULL,
  raw_json JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  estimated_savings_cents INTEGER NOT NULL DEFAULT 0,
  returns_analyzed INTEGER NOT NULL DEFAULT 0,
  recommendations JSONB NOT NULL,
  source_pattern JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_items (
  id SERIAL PRIMARY KEY,
  insight_id INTEGER NOT NULL REFERENCES ai_insights(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  estimated_impact_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'New',
  assigned_to TEXT,
  due_date DATE,
  impact_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE action_items ADD COLUMN IF NOT EXISTS impact_note TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_customer_sub ON orders(customer_sub);
CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_sub ON returns(customer_sub);
CREATE INDEX IF NOT EXISTS idx_returns_order_item ON returns(order_item_id);
CREATE INDEX IF NOT EXISTS idx_insights_product ON ai_insights(product_id);
CREATE INDEX IF NOT EXISTS idx_action_items_product ON action_items(product_id);
