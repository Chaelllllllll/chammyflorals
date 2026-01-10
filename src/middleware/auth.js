const crypto = require('crypto');
const supabase = require('../config/supabase');
const { getSession } = require('../lib/sessionStore');

function safeEqual(a, b) {
  try {
    const aa = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (aa.length !== bb.length) return false;
    return crypto.timingSafeEqual(aa, bb);
  } catch (err) {
    return false;
  }
}

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth middleware - Authorization header present:', !!authHeader);
  // If Passport has already populated `req.user` (cookie/session auth), accept it.
  if (req.user && req.user.id) {
    console.log('Auth middleware - Detected passport session user');
    req.admin = { id: req.user.id, email: req.user.email };
    return next();
  }

  // If express-session has a stored passport user id, accept it.
  if (req.session && req.session.passport && req.session.passport.user) {
    try {
      const stored = req.session.passport.user;
      console.log('Auth middleware - Detected session passport user:', typeof stored === 'string' ? 'id' : 'object');
      // If stored value is an object with id, use that; otherwise use as id
      if (stored && typeof stored === 'object' && stored.id) {
        req.admin = { id: stored.id, email: stored.email };
      } else {
        req.admin = { id: stored };
      }
      return next();
    } catch (e) {
      console.warn('Auth middleware - passport session handling failed:', e && e.message ? e.message : e);
    }
  }

  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.replace('Bearer ', '');
  const tokenStr = String(token || '').trim();
  console.log('Auth middleware - Token length:', tokenStr.length);

  // 1) If an Authorization header is present and looks like a JWT, try to verify it first.
  try {
    const jwt = require('jsonwebtoken');
    if (tokenStr && tokenStr.split('.').length === 3) {
      try {
        const decodedJwt = jwt.verify(tokenStr, process.env.JWT_SECRET || 'your-secret-key');
        const adminId = decodedJwt.id || decodedJwt.adminId || decodedJwt.user_id || decodedJwt.userId;
        const adminEmail = decodedJwt.email || decodedJwt.user_email || decodedJwt.email_address || null;
        if (adminId) {
          console.log('Auth middleware - JWT verified, admin authenticated');
          req.admin = { id: adminId, email: adminEmail };
          return next();
        }
      } catch (jwtErr) {
        console.warn('Auth middleware - JWT verify failed:', jwtErr && jwtErr.message ? jwtErr.message : jwtErr);
        // fall through to other token types
      }
    }
  } catch (e) {
    // jsonwebtoken not available or other error - fall through
  }

  // 2) Try in-memory session token lookup (fast, works even if DB persistence failed)
  try {
    if (tokenStr) {
      const rec = getSession(tokenStr);
      if (rec && rec.expires && rec.expires > Date.now()) {
        console.log('Auth middleware - In-memory session valid');
        req.admin = rec.admin || { id: rec.adminId };
        return next();
      }
    }
  } catch (e) {
    console.warn('Auth middleware in-memory session check failed (fallthrough):', e && e.message ? e.message : e);
  }

  // 2) Try session token lookup in DB (short-lived, random token)
  try {
    if (tokenStr) {
      const { data: sessionRow, error: sessErr } = await supabase.from('admins').select('id,email,session_expires').eq('session_token', tokenStr).limit(1).single();
      if (!sessErr && sessionRow && sessionRow.session_expires && new Date(sessionRow.session_expires).getTime() > Date.now()) {
        // valid session token
        req.admin = { id: sessionRow.id, email: sessionRow.email };
        return next();
      }
    }
  } catch (e) {
    console.warn('Auth middleware session-token DB check failed (fallthrough):', e && e.message ? e.message : e);
  }

  // 2) Fallback: legacy base64 email:password token parsing
  let decoded = '';
  console.log('Auth middleware - Trying base64 decode');
  try { decoded = Buffer.from(String(tokenStr), 'base64').toString(); } catch (e) { 
    console.error('Auth middleware - Base64 decode failed:', e.message);
    return res.status(401).json({ error: 'Invalid token' }); 
  }
  const [email, password] = decoded.split(':');
  console.log('Auth middleware - Decoded email:', email ? 'present' : 'missing');
  if (!email || !password) {
    console.error('Auth middleware - Email or password missing from token');
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Normalize email for comparisons
  const normEmail = String(email).trim().toLowerCase();
  const normEnvEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  console.log('Auth middleware - Checking env credentials');
  // First try legacy env-based check for compatibility
  if (safeEqual(normEmail, normEnvEmail) && safeEqual(password, process.env.ADMIN_PASSWORD)) {
    console.log('Auth middleware - Env auth successful');
    req.admin = { email: normEmail, id: 'env-admin' };
    return next();
  }

  // Otherwise try to validate against admins table password_hash
  console.log('Auth middleware - Checking DB credentials');
  try {
    const { data: adminRow, error } = await supabase.from('admins').select('password_hash,email').eq('email', normEmail).limit(1).single();
    if (error || !adminRow || !adminRow.password_hash) {
      console.error('Auth middleware - DB lookup failed:', error?.message || 'No admin row found');
      return res.status(401).json({ error: 'Invalid token' });
    }
    const parts = String(adminRow.password_hash).split('$');
    if (parts.length !== 2) {
      console.error('Auth middleware - Invalid password hash format');
      return res.status(401).json({ error: 'Invalid token' });
    }
    const salt = parts[0];
    const stored = parts[1];
    const derived = crypto.scryptSync(String(password), String(salt), 64).toString('hex');
    if (!safeEqual(derived, stored)) {
      console.error('Auth middleware - Password verification failed');
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.log('Auth middleware - DB auth successful');
    req.admin = { id: adminRow.id, email: adminRow.email };
    return next();
  } catch (err) {
    console.warn('Auth middleware DB validation failed:', err && err.message ? err.message : err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};