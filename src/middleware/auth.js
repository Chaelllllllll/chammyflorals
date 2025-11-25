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
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.replace('Bearer ', '');
  const tokenStr = String(token || '').trim();
  console.log('Auth middleware - Token length:', tokenStr.length);

  // 1) Try in-memory session token lookup (fast, works even if DB persistence failed)
  try {
    if (tokenStr) {
      const rec = getSession(tokenStr);
      if (rec && rec.expires && rec.expires > Date.now()) {
        console.log('Auth middleware - In-memory session valid');
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
    return next();
  } catch (err) {
    console.warn('Auth middleware DB validation failed:', err && err.message ? err.message : err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};