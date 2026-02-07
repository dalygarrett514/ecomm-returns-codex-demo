const express = require('express');
const cors = require('cors');
const config = require('./config');
const { authenticate } = require('./middleware/auth');
const customerRoutes = require('./routes/customerRoutes');
const merchantRoutes = require('./routes/merchantRoutes');

const app = express();

app.use(
  cors({
    origin: config.app.clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    authDisabled: config.auth.disabled,
    build: 'api-2026-02-06',
    merchantRoutes: [
      '/api/merchant/dashboard',
      '/api/merchant/products',
      '/api/merchant/products/:productId',
      '/api/merchant/products/:productId/generate-insight',
      '/api/merchant/insights/:insightId/action-items'
    ]
  });
});

app.use('/api', authenticate);
app.use('/api/customer', customerRoutes);
app.use('/api/merchant', merchantRoutes);

app.use((error, _req, res, _next) => {
  if (error && error.status) {
    return res.status(error.status).json({ error: error.code || 'auth_error', message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    error: 'internal_server_error',
    message: 'Unexpected server error.'
  });
});

app.listen(config.app.port, () => {
  console.log(`API server listening on http://localhost:${config.app.port}`);
});

module.exports = app;
