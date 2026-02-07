const test = require('node:test');
const assert = require('node:assert/strict');
const { requireRole } = require('../middleware/rbac');

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('rbac middleware blocks users without required role', () => {
  const middleware = requireRole('merchant');
  const req = { user: { roles: ['customer'] } };
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'forbidden');
});

test('rbac middleware allows users with required role', () => {
  const middleware = requireRole('merchant');
  const req = { user: { roles: ['customer', 'merchant'] } };
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
