const config = require('../config');

let jwtCheck;

if (!config.auth.disabled) {
  const { auth } = require('express-oauth2-jwt-bearer');
  jwtCheck = auth({
    audience: config.auth.audience,
    issuerBaseURL: `https://${config.auth.domain}/`,
    tokenSigningAlg: 'RS256'
  });
}

function extractRoles(payload = {}) {
  const namespacedRoles = payload[`${config.auth.rolesClaimNamespace}/roles`];
  const fallbackRoles = payload.roles;
  const roles = namespacedRoles || fallbackRoles || [];

  if (Array.isArray(roles)) {
    return roles;
  }

  if (typeof roles === 'string' && roles.length > 0) {
    return roles.split(',').map((role) => role.trim());
  }

  return [];
}

function buildUserContext(payload = {}) {
  const roles = extractRoles(payload);
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    roles,
    merchantId: payload[`${config.auth.rolesClaimNamespace}/merchant_id`] || payload.merchant_id || null
  };
}

function demoAuth(req, _res, next) {
  const demoRole = req.header('x-demo-role') || 'customer';
  const demoSub = req.header('x-demo-user') || `auth0|${demoRole}-demo`;
  const demoMerchantId = req.header('x-demo-merchant-id');

  req.user = {
    sub: demoSub,
    email: `${demoRole}@demo.local`,
    name: demoRole === 'merchant' ? 'Merchant Demo' : 'Customer Demo',
    roles: [demoRole],
    merchantId: demoMerchantId ? Number(demoMerchantId) : 1
  };

  next();
}

function authenticate(req, res, next) {
  if (config.auth.disabled) {
    return demoAuth(req, res, next);
  }

  return jwtCheck(req, res, (error) => {
    if (error) {
      return next(error);
    }

    req.user = buildUserContext(req.auth && req.auth.payload ? req.auth.payload : {});
    return next();
  });
}

module.exports = {
  authenticate,
  extractRoles,
  buildUserContext
};
