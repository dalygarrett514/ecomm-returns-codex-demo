const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000/api';

async function apiRequest(path, { method = 'GET', token, body, demoAuth } = {}) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (demoAuth) {
    headers['x-demo-role'] = demoAuth.role;
    headers['x-demo-user'] = demoAuth.sub;
    headers['x-demo-merchant-id'] = String(demoAuth.merchantId || 1);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function createApiClient(authContext) {
  async function withAuth(path, options = {}) {
    if (authContext.isDemo) {
      return apiRequest(path, {
        ...options,
        demoAuth: {
          role: authContext.role,
          sub: authContext.user.sub,
          merchantId: authContext.user.merchantId
        }
      });
    }

    const token = await authContext.getAccessToken();
    return apiRequest(path, {
      ...options,
      token
    });
  }

  return {
    getCustomerOrders: () => withAuth('/customer/orders'),
    getCustomerReturns: () => withAuth('/customer/returns'),
    submitReturn: (payload) => withAuth('/customer/returns', { method: 'POST', body: payload }),

    getDashboard: () => withAuth('/merchant/dashboard'),
    getProducts: (sortBy) => withAuth(`/merchant/products?sortBy=${encodeURIComponent(sortBy)}`),
    getProductDetail: (productId) => withAuth(`/merchant/products/${productId}`),
    generateInsight: (productId) => withAuth(`/merchant/products/${productId}/generate-insight`, { method: 'POST', body: {} }),
    createActionItem: (insightId, payload) =>
      withAuth(`/merchant/insights/${insightId}/action-items`, { method: 'POST', body: payload }),
    getActionItems: (filters = {}) => {
      const query = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          query.append(key, value);
        }
      });
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return withAuth(`/merchant/action-items${suffix}`);
    },
    updateActionItem: (actionItemId, patch) =>
      withAuth(`/merchant/action-items/${actionItemId}`, {
        method: 'PATCH',
        body: patch
      })
  };
}
