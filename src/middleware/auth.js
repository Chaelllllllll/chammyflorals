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
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.replace('Bearer ', '');
  const tokenStr = String(token || '').trim();

  // 1) Try in-memory session token lookup (fast, works even if DB persistence failed)
  try {
    if (tokenStr) {
      const rec = getSession(tokenStr);
      if (rec && rec.expires && rec.expires > Date.now()) return next();
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
  try { decoded = Buffer.from(String(tokenStr), 'base64').toString(); } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
  const [email, password] = decoded.split(':');
  if (!email || !password) return res.status(401).json({ error: 'Invalid token' });

  // Normalize email for comparisons
  const normEmail = String(email).trim().toLowerCase();
  const normEnvEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  // First try legacy env-based check for compatibility
  if (safeEqual(normEmail, normEnvEmail) && safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return next();
  }

  // Otherwise try to validate against admins table password_hash
  try {
    const { data: adminRow, error } = await supabase.from('admins').select('password_hash,email').eq('email', normEmail).limit(1).single();
    if (error || !adminRow || !adminRow.password_hash) return res.status(401).json({ error: 'Invalid token' });
    const parts = String(adminRow.password_hash).split('$');
    if (parts.length !== 2) return res.status(401).json({ error: 'Invalid token' });
    const salt = parts[0];
    const stored = parts[1];
    const derived = crypto.scryptSync(String(password), String(salt), 64).toString('hex');
    if (!safeEqual(derived, stored)) return res.status(401).json({ error: 'Invalid token' });
    return next();
  } catch (err) {
    console.warn('Auth middleware DB validation failed:', err && err.message ? err.message : err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};