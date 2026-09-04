require('dotenv').config();
const jwt = require('jsonwebtoken');
const { optionalCustomerOrAdminAuth } = require('../src/routes/api');

describe('Guest Order Authentication Middleware Tests', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

  test('guest request without token proceeds with req.userType = "guest" and req.user = null', async () => {
    const req = {
      method: 'POST',
      path: '/inquiry',
      headers: {},
      body: {
        user_name: 'Jane Doe',
        user_email: 'jane@example.com'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await optionalCustomerOrAdminAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userType).toBe('guest');
    expect(req.user).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('customer request with valid JWT sets req.userType = "customer" and req.user', async () => {
    const customerPayload = { customerId: 42, email: 'customer@example.com' };
    const validToken = jwt.sign(customerPayload, JWT_SECRET);

    const req = {
      method: 'POST',
      path: '/inquiry',
      headers: {
        authorization: `Bearer ${validToken}`
      },
      body: {
        user_name: 'Customer User',
        user_email: 'customer@example.com'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await optionalCustomerOrAdminAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userType).toBe('customer');
    expect(req.user).toBeDefined();
    expect(req.user.customerId).toBe(42);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('request with invalid / expired token does NOT block order; falls back to guest', async () => {
    const req = {
      method: 'POST',
      path: '/inquiry',
      headers: {
        authorization: 'Bearer invalid.or.expired.token'
      },
      body: {
        user_name: 'Guest User',
        user_email: 'guest@example.com'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await optionalCustomerOrAdminAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userType).toBe('guest');
    expect(req.user).toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('manual order without admin token is rejected with 401', async () => {
    const req = {
      method: 'POST',
      path: '/inquiry',
      headers: {},
      body: {
        manual_order: true,
        user_name: 'Fake Admin',
        user_email: 'fake@example.com'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await optionalCustomerOrAdminAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });
});
