function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    const userRoles = req.user && Array.isArray(req.user.roles) ? req.user.roles : [];
    const authorized = allowedRoles.some((role) => userRoles.includes(role));

    if (!authorized) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires one of roles: ${allowedRoles.join(', ')}`
      });
    }

    return next();
  };
}

module.exports = {
  requireRole
};
