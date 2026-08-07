require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_SAFE = JWT_SECRET || 'dev-jwt-secret-change-in-production';

// Mint a dummy admin token
const token = jwt.sign(
  {
    id: 1,
    email: 'admin@chammy.com',
    name: 'Admin Test',
    role: 'admin'
  },
  JWT_SECRET_SAFE,
  { expiresIn: '1d' }
);

async function run() {
  console.log('Minted token:', token);
  try {
    const verifyRes = await fetch('http://localhost:3000/api/admin/verify-token', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Verify Status:', verifyRes.status);
    const verifyBody = await verifyRes.text();
    console.log('Verify Body:', verifyBody);

    const response = await fetch('http://localhost:3000/api/admin/orders', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Orders Status:', response.status);
    const body = await response.text();
    console.log('Orders Body:', body.slice(0, 1000));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
