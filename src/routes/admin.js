const express = require('express');
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const { validateOrderStatus, validateProduct, sanitizeBody } = require('../middleware/validators');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { sendPushNotification } = require('../lib/push-notifications');
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // limit uploads to 5MB
const router = express.Router();
const fs = require('fs');
const messenger = require('../lib/messenger');
const { setSession } = require('../lib/sessionStore');
const path = require('path');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const NOTIF_STATE_FILE = path.join(__dirname, '..', 'data', 'notifications_state.json');

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

// Try to ensure the storage bucket exists (best-effort). This uses the service key so it can create buckets.
// Try to ensure the storage bucket exists (best-effort). This uses the service key so it can create buckets.
// Guard this behavior in environments (like Vercel serverless) where outgoing fetch/TLS may fail
// or where we don't have a Supabase service role key. Creating buckets on cold-starts is
// unnecessary in production and can cause noisy errors (see StorageUnknownError/undici socket errors).
(async () => {
  // Require a Supabase service role key (or explicitly enabled env) before attempting to create buckets.
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY;
  if (!svcKey) {
    console.log('Skipping auto-create of Supabase storage bucket because no service role key is configured.');
    return;
  }
  try {
    const resp = await supabase.storage.createBucket(STORAGE_BUCKET, { public: true });
    if (resp.error) {
      // 409 or similar means bucket already exists; log otherwise
      if (resp.error.status && String(resp.error.status).startsWith('4')) {
        console.log('Bucket create response:', resp.error.message || resp.error);
      } else {
        console.error('Error creating bucket:', resp.error);
      }
    } else {
      console.log(`Storage bucket '${STORAGE_BUCKET}' ready`);
    }
  } catch (err) {
    console.warn('Could not auto-create or verify storage bucket (not fatal):', err.message || err);
  }
})();

async function uploadBase64ToStorage(dataUrl) {
  // dataUrl like: data:image/png;base64,AAAA...
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL');
  const contentType = match[1];
  // Only allow image content types
  if (!contentType.startsWith('image/')) throw new Error('Only image uploads are allowed');
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');
  const ext = contentType.split('/')[1] || 'png';
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const path = `products/${filename}`;

  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw uploadError;
  }
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path };
}

// Rate limit login attempts to mitigate brute force attacks (configurable via ADMIN_LOGIN_MAX)
const LOGIN_RATE_MAX = Number(process.env.ADMIN_LOGIN_MAX || 6);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: LOGIN_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req /*, res*/) => {
    const xf = req.headers['x-forwarded-for'] || req.headers['forwarded'] || req.headers['x-real-ip'];
    if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
    try {
      return ipKeyGenerator(req.ip);
    } catch (err) {
      return req.ip || '';
    }
  },
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, totp } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    // Use timing-safe comparison to avoid leaking which part failed
    const safeEqual = (a, b) => {
      try {
        const aa = Buffer.from(String(a));
        const bb = Buffer.from(String(b));
        if (aa.length !== bb.length) return false;
        return crypto.timingSafeEqual(aa, bb);
      } catch (err) {
        return false;
      }
    };

    // Validate credentials against admins table (preferred) or fall back to
    // environment variables for legacy single-admin setups.
    const normEmail = String(email).trim().toLowerCase();
    let totpSecret = null;
    let adminId = null;
    let token = null;
    
    try {
      const { data: adminRow, error: adminErr } = await supabase
        .from('admins')
        .select('id,email,password_hash,totp_secret,totp_enabled,status')
        .eq('email', normEmail)
        .limit(1)
        .single();
      
      if (!adminErr && adminRow && adminRow.email) {
        // Admin row exists in DB; verify password_hash using scrypt
        const ph = adminRow.password_hash || '';
        if (!ph) {
          console.log('Admin account has no password set:', { email });
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        const parts = String(ph).split('$');
        if (parts.length !== 2) {
          console.warn('Unsupported password hash format for admin:', email);
          return res.status(500).json({ error: 'Server error verifying password' });
        }
        const salt = parts[0];
        const stored = parts[1];
        const derived = require('crypto').scryptSync(String(password), String(salt), 64).toString('hex');
        if (!safeEqual(derived, stored)) {
          console.log('Login failed for admin (db):', { email });
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Password OK
        adminId = adminRow.id;
        totpSecret = adminRow.totp_secret;
        const totpEnabled = adminRow.totp_enabled;
        
        // Check if TOTP is required
        if (totpEnabled && totpSecret) {
          // TOTP is enabled, verify code
          if (!totp) {
            return res.status(200).json({ 
              requiresTOTP: true,
              message: 'Please enter your Google Authenticator code'
            });
          }
          
          // Verify TOTP code
          const verified = speakeasy.totp.verify({
            secret: totpSecret,
            encoding: 'base32',
            token: totp,
            window: 2 // Allow 2 steps before/after for clock skew
          });
          
          if (!verified) {
            return res.status(401).json({ error: 'Invalid authenticator code' });
          }
        } else if (!totpEnabled || !totpSecret) {
          // TOTP not setup yet - generate secret and return QR code
          const secret = speakeasy.generateSecret({
            name: `Chammy Florals (${normEmail})`,
            issuer: 'Chammy Florals'
          });
          
          // Save secret to database
          await supabase
            .from('admins')
            .update({ totp_secret: secret.base32, totp_enabled: false })
            .eq('id', adminId);
          
          // Generate QR code
          const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
          
          return res.status(200).json({
            setupRequired: true,
            secret: secret.base32,
            qrCode: qrCodeUrl,
            message: 'Scan this QR code with Google Authenticator'
          });
        }
        
        // Generate session token
        token = Buffer.from(`${normEmail}:${password}`).toString('base64');
      } else {
        // No admin row found — fall back to legacy env var check
        console.log('No admin row in DB, checking env vars for:', normEmail);
        if (!safeEqual(normEmail, process.env.ADMIN_EMAIL) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
          console.log('Login failed (env fallback) for:', { email });
          return res.status(401).json({ error: 'Invalid email or password' });
        }
        // Env login successful - but no TOTP for env-only admins
        token = Buffer.from(`${normEmail}:${password}`).toString('base64');
      }
    } catch (dbErr) {
      console.warn('Failed to lookup admin in DB:', dbErr && dbErr.message ? dbErr.message : dbErr);
      // As a last resort allow env check
      console.log('DB error, checking env vars for:', normEmail);
      if (!safeEqual(normEmail, process.env.ADMIN_EMAIL) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      token = Buffer.from(`${normEmail}:${password}`).toString('base64');
    }

    // Success - return token
    res.json({
      token,
      user: { email: normEmail, role: 'admin' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to process login' });
  }
});

// Setup TOTP - Enable TOTP after scanning QR code
router.post('/login/enable-totp', loginLimiter, async (req, res) => {
  try {
    const { email, password, totp } = req.body;
    if (!email || !password || !totp) {
      return res.status(400).json({ error: 'Email, password, and TOTP code are required' });
    }

    const normEmail = String(email).trim().toLowerCase();
    
    // Verify password first
    const { data: adminRow, error: adminErr } = await supabase
      .from('admins')
      .select('id,email,password_hash,totp_secret,totp_enabled')
      .eq('email', normEmail)
      .limit(1)
      .single();
    
    if (adminErr || !adminRow) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ph = adminRow.password_hash || '';
    const parts = String(ph).split('$');
    if (parts.length !== 2) {
      return res.status(500).json({ error: 'Server error' });
    }
    
    const salt = parts[0];
    const stored = parts[1];
    const derived = crypto.scryptSync(String(password), String(salt), 64).toString('hex');
    
    const safeEqual = (a, b) => {
      try {
        const aa = Buffer.from(String(a));
        const bb = Buffer.from(String(b));
        if (aa.length !== bb.length) return false;
        return crypto.timingSafeEqual(aa, bb);
      } catch (err) {
        return false;
      }
    };
    
    if (!safeEqual(derived, stored)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify TOTP code
    const verified = speakeasy.totp.verify({
      secret: adminRow.totp_secret,
      encoding: 'base32',
      token: totp,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid authenticator code' });
    }

    // Enable TOTP
    await supabase
      .from('admins')
      .update({ totp_enabled: true })
      .eq('id', adminRow.id);

    const token = Buffer.from(`${normEmail}:${password}`).toString('base64');
    
    res.json({
      success: true,
      token,
      user: { email: normEmail, role: 'admin' },
      message: 'Google Authenticator enabled successfully'
    });
  } catch (error) {
    console.error('Enable TOTP error:', error);
    res.status(500).json({ error: 'Failed to enable TOTP' });
  }
});

// Verify 2FA code and issue token (kept for backwards compatibility, but now unused)
router.post('/login/verify', loginLimiter, async (req, res) => {
  res.status(404).json({ error: 'This endpoint is deprecated. Use Google Authenticator instead.' });
});

// Old verify endpoint - remove after migration
router.post('/login/verify-old', loginLimiter, async (req, res) => {
  try {
  const { email, code } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
  const normEmail = String(email).trim().toLowerCase();
    // Prefer DB-stored code if available (persisted across instances). Fall back to in-memory.
    try {
      const { data: adminRow, error: adminErr } = await supabase.from('admins').select('twofa_code,twofa_expires,twofa_token').eq('email', normEmail).limit(1).single();
      if (!adminErr && adminRow && adminRow.twofa_code) {
        const dbCode = String(adminRow.twofa_code || '').trim();
        const dbExpires = adminRow.twofa_expires ? new Date(adminRow.twofa_expires).getTime() : 0;
        if (Date.now() > dbExpires) {
          // clear expired
          try { await supabase.from('admins').update({ twofa_code: null, twofa_expires: null, twofa_token: null }).eq('email', normEmail); } catch (e) {}
          return res.status(400).json({ error: '2FA code expired' });
        }
        if (String(code).trim() !== dbCode) return res.status(401).json({ error: 'Invalid 2FA code' });
        // clear used code and create a one-time session token (random) for the admin
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiresAt = new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(); // 8 hours
        try {
          await supabase.from('admins').update({ twofa_code: null, twofa_expires: null, twofa_token: null, session_token: sessionToken, session_expires: sessionExpiresAt }).eq('email', normEmail);
        } catch (e) {
          console.warn('Failed to persist session token to DB (best-effort):', e && e.message ? e.message : e);
        }
        // Always populate in-memory session store so the token is immediately usable
        try { setSession(sessionToken, normEmail, new Date(sessionExpiresAt).getTime()); } catch (e) {}
        const mem = twofaStore.get(normEmail); if (mem) twofaStore.delete(normEmail);
        return res.json({ token: sessionToken });
      }
    } catch (dbErr) {
      console.warn('Failed to read/verify 2FA from DB (falling back to memory):', dbErr && dbErr.message ? dbErr.message : dbErr);
    }

    // Fallback: check in-memory store
    const rec = twofaStore.get(normEmail);
    if (!rec) return res.status(400).json({ error: 'No pending 2FA request for this email' });
    if (Date.now() > rec.expires) {
      twofaStore.delete(normEmail);
      return res.status(400).json({ error: '2FA code expired' });
    }
    if (String(code).trim() !== String(rec.code).trim()) return res.status(401).json({ error: 'Invalid 2FA code' });
    // success — issue a secure session token, persist (best-effort), and clear store
    twofaStore.delete(normEmail);
    try {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const sessionExpiresAt = new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(); // 8 hours
      try {
        await supabase.from('admins').update({ twofa_code: null, twofa_expires: null, twofa_token: null, session_token: sessionToken, session_expires: sessionExpiresAt }).eq('email', normEmail);
      } catch (e) {
        console.warn('Failed to persist session token to DB (fallback):', e && e.message ? e.message : e);
      }
      // populate in-memory session store so the token is usable immediately
      try { setSession(sessionToken, normEmail, new Date(sessionExpiresAt).getTime()); } catch (e) {}
      return res.json({ token: sessionToken });
    } catch (e) {
      return res.json({ token: null });
    }
  } catch (err) {
    console.error('2FA verify error:', err);
    return res.status(500).json({ error: 'Failed to verify 2FA code' });
  }
});

router.get('/verify-token', auth, async (req, res) => {
  try {
    // Extract email from the request (set by auth middleware)
    // The auth middleware validates the token and we can extract email from it
    const authHeader = req.headers.authorization || '';
    const tokenStr = authHeader.replace(/^Bearer\s+/i, '').trim();
    
    let email = null;
    
    // Try to get email from session token in database
    try {
      const { data: sessionRow } = await supabase.from('admins').select('email').eq('session_token', tokenStr).limit(1).single();
      if (sessionRow && sessionRow.email) {
        email = sessionRow.email;
      }
    } catch (e) {
      // If not session token, try to decode as legacy base64 token
      try {
        const decoded = Buffer.from(tokenStr, 'base64').toString();
        if (decoded.includes(':')) {
          email = decoded.split(':')[0];
        }
      } catch (decodeErr) {
        // Ignore
      }
    }
    
    res.json({ valid: true, email: email ? email.trim().toLowerCase() : null });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/orders', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('orders').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get a single order by order_id (protected)
router.get('/orders/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });
    const { data, error } = await supabase.from('orders').select('*').eq('order_id', String(orderId)).single();
    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Notifications: list recent new orders since a timestamp or since last viewed
router.get('/notifications', auth, async (req, res) => {
  try {
    let since = req.query.since;
    // If client didn't provide `since`, try to read server-side lastViewed state
    if (!since) {
      try {
        if (fs.existsSync(NOTIF_STATE_FILE)) {
          const raw = fs.readFileSync(NOTIF_STATE_FILE, 'utf8');
          const obj = raw ? JSON.parse(raw) : {};
          if (obj && obj.lastViewed) since = obj.lastViewed;
          // ensure viewed array exists
          if (!obj.viewed) obj.viewed = [];
          // attach obj to request for downstream filtering convenience
          req._notifState = obj;
        }
      } catch (e) {
        console.warn('Failed to read notification state file:', e && e.message);
      }
    }

    // Default to the last 24 hours if no timestamp available
    if (!since) {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      since = d.toISOString();
    }

    // Query orders created after `since` and which are not yet Delivered
    const { data, error } = await supabase
      .from('orders')
      .select('order_id,name,total_fee,created_at,status,flower_type')
      .gt('created_at', since)
      .not('status', 'eq', 'Delivered')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const state = req._notifState || (fs.existsSync(NOTIF_STATE_FILE) ? JSON.parse(fs.readFileSync(NOTIF_STATE_FILE, 'utf8') || '{}') : {});
    const viewedSet = new Set((state && state.viewed && Array.isArray(state.viewed)) ? state.viewed : []);
    const filtered = (data || []).filter(o => !viewedSet.has(o.order_id));
    res.json({ notifications: filtered, since });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notifications as viewed. If body.orderId is provided mark that specific
// order as viewed; otherwise update lastViewed timestamp (mark all up to now).
router.post('/notifications/markViewed', auth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const dir = path.dirname(NOTIF_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let state = { lastViewed: null, viewed: [] };
    try {
      if (fs.existsSync(NOTIF_STATE_FILE)) {
        const raw = fs.readFileSync(NOTIF_STATE_FILE, 'utf8') || '{}';
        state = Object.assign(state, JSON.parse(raw));
        if (!Array.isArray(state.viewed)) state.viewed = [];
      }
    } catch (readErr) {
      console.warn('Failed to read notification state file (markViewed):', readErr && readErr.message);
    }

    if (orderId) {
      // add single order id to viewed list (avoid duplicates)
      if (!state.viewed.includes(orderId)) state.viewed.push(orderId);
      try {
        fs.writeFileSync(NOTIF_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      } catch (fsErr) {
        console.warn('Failed to write notification state file (single):', fsErr && fsErr.message);
      }
      return res.json({ message: 'Notification marked viewed', orderId });
    }

    // otherwise, mark lastViewed timestamp to now (legacy behavior)
    state.lastViewed = new Date().toISOString();
    try {
      fs.writeFileSync(NOTIF_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Failed to write notification state file (all):', fsErr && fsErr.message);
    }
    res.json({ message: 'Notifications marked viewed', lastViewed: state.lastViewed });
  } catch (err) {
    console.error('Error marking notifications viewed:', err);
    res.status(500).json({ error: 'Failed to mark viewed' });
  }
});

// Admin: reports endpoint - aggregated sales by day (last 30 days) and month (last 12 months)
router.get('/reports', auth, async (req, res) => {
  try {
    // allow optional date range filtering via ?from=YYYY-MM-DD&to=YYYY-MM-DD
    const { from, to } = req.query || {};
    const q = supabase.from('orders').select('order_id,name,total_fee,created_at,status').order('created_at', { ascending: true });
    if (from) q.gte('created_at', new Date(from).toISOString());
    else {
      // default to last 12 months
      const startMonths = new Date();
      startMonths.setMonth(startMonths.getMonth() - 11);
      q.gte('created_at', startMonths.toISOString());
    }
    if (to) q.lte('created_at', new Date(to).toISOString());

    const { data: orders, error } = await q;
    if (error) throw error;

    // compute total revenue from delivered orders and return list of delivered orders
    let total = 0;
    const deliveredOrders = (orders || []).filter(o => String(o.status || '').toLowerCase() === 'delivered');
    for (const o of deliveredOrders) {
      total += Number(o.total_fee) || 0;
    }
    // return minimal fields for display
    const rows = deliveredOrders.map(o => ({ order_id: o.order_id, name: o.name, total_fee: Number(o.total_fee) || 0, created_at: o.created_at }));
    return res.json({ total_revenue: total, orders: rows });
  } catch (err) {
    console.error('reports error:', err);
    return res.status(500).json({ error: 'Failed to compute reports' });
  }
});

// Admin: debug preview of Messenger reply formatting for an order (dev/admin only)
router.get('/debug/messenger-preview', auth, async (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const { data: order, error } = await supabase.from('orders').select('*').eq('order_id', String(orderId)).single();
    if (error || !order) return res.status(404).json({ error: 'Order not found' });

    // replicate the message formatting used by the messenger handler
    function toBold(s) {
      if (s == null) return '';
      const str = String(s);
      let out = '';
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) { out += String.fromCodePoint(0x1D400 + (code - 65)); continue; }
        if (code >= 97 && code <= 122) { out += String.fromCodePoint(0x1D41A + (code - 97)); continue; }
        if (code >= 48 && code <= 57) { out += String.fromCodePoint(0x1D7CE + (code - 48)); continue; }
        out += ch;
      }
      return out;
    }

    const parts = [];
    parts.push('⋆˚✿˖° 𝐎𝐫𝐝𝐞𝐫 𝐒𝐭𝐚𝐭𝐮𝐬 ⋆˚✿˖°');
    parts.push('───────୨ৎ───────');
    parts.push(`Order ID: ${toBold(order.order_id)}`);
    if (order.status) parts.push(`Status: ${toBold(String(order.status || ''))}`);
    if (order.name) parts.push(`Customer: ${toBold(order.name)}`);
    // items formatting: prefer items array or flower_type/quantity
    let itemsText = '';
    try {
      let types = order.items && Array.isArray(order.items) ? order.items.map(i => i.flower_type) : order.flower_type;
      let qtys = order.items && Array.isArray(order.items) ? order.items.map(i => i.quantity) : order.quantity;
      if (typeof types === 'string' && types.trim().startsWith('[')) types = JSON.parse(types);
      if (typeof qtys === 'string' && qtys.trim().startsWith('[')) qtys = JSON.parse(qtys);
      if (typeof types === 'string') types = types.split(',').map(s=>s.trim());
      if (typeof qtys === 'string') qtys = qtys.split(',').map(s=>s.trim());
      if (!Array.isArray(types)) types = [types];
      if (!Array.isArray(qtys)) qtys = [qtys];
      if (types.length > 1) {
        const lines = types.map((t,i)=> `• ${toBold(t)} × ${toBold(Number(qtys[i]||qtys[0]||1))}`);
        itemsText = `Items:\n${lines.join('\n')}`;
      } else {
        itemsText = `Items: ${toBold(types[0])} × ${toBold(Number(qtys[0]||1))}`;
      }
    } catch (e) {
      itemsText = `Items: ${toBold(order.flower_type)}`;
    }
    parts.push(itemsText);
    if (typeof order.total_fee !== 'undefined') parts.push(`Total: ₱${toBold(Number(order.total_fee).toLocaleString())}`);
    const reply = parts.join('\n');
    return res.json({ reply, order: { order_id: order.order_id } });
  } catch (err) {
    console.error('debug preview error', err);
    return res.status(500).json({ error: 'Failed to build preview' });
  }
});

// Admin: list all products (protected)
router.get('/products', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_url,image_path,category,pricing,addons,colors,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching products (admin):', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Admin: categories CRUD (protected)
router.get('/categories', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('id,name,slug,rush_fee').order('name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching admin categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    const record = { name: String(name).trim(), slug };
    if (req.body.rush_fee !== undefined) record.rush_fee = Number(req.body.rush_fee) || 0;
    const { data, error } = await supabase.from('categories').insert([record]).select('id,name,slug,rush_fee');
    if (error) {
      console.error('Error creating category:', error);
      return res.status(500).json({ error: 'Failed to create category' });
    }
    res.json(data[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.patch('/categories/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!id) return res.status(400).json({ error: 'ID is required' });
    const updates = {};
    if (name !== undefined) {
      updates.name = String(name).trim();
      updates.slug = String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    }
    if (req.body.rush_fee !== undefined) {
      updates.rush_fee = Number(req.body.rush_fee) || 0;
    }
  const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select('id,name,slug,rush_fee');
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID is required' });
    const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id,name');
    if (error) throw error;
    res.json({ message: 'Category deleted', category: data[0] });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

router.patch('/orders/:orderId', auth, sanitizeBody, async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = {};
    // Allow updating common order fields safely
  const allowed = ['name','email','fb_link','flower_type','quantity','addons','message','rush','total_fee','status','items','created_at'];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        updates[k] = req.body[k];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    // Fetch existing order for side-effects (emails) and to compute previous status
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (fetchErr && fetchErr.code !== 'PGRST116') {
      console.error('Failed to fetch order before update:', fetchErr);
    }
    const previousStatus = existing ? existing.status : null;

    // If admin provided created_at, store it as-provided (we prefer saving the admin/client local datetime string)
    if (updates.created_at) {
      try {
        // coerce to string and trim
        updates.created_at = String(updates.created_at).trim();
      } catch (e) { /* ignore */ }
    }

    const { data: updatedRows, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('order_id', orderId)
      .select();
    if (error) throw error;
    
      // Audit log: record the update
      try {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin';
        const audit = {
          order_id: orderId,
          admin_email: adminEmail,
          action: 'update',
          changes: updates,
        };
        await supabase.from('order_audits').insert([audit]);
      } catch (auditErr) {
        console.warn('Failed to write order audit:', auditErr);
      }

    // If status changed, send a status update email (best-effort)
    try {
      const updated = (updatedRows && updatedRows[0]) || null;
      console.log('Status update check:', {
        hasUpdated: !!updated,
        previousStatus,
        newStatus: updated?.status,
        statusChanged: previousStatus !== updated?.status,
        hasEmail: !!updated?.email,
        hasPsid: !!(updated?.messenger_psid || updated?.customer_psid)
      });

      if (updated && previousStatus !== updated.status && updated.email) {
        console.log('Status changed, sending notifications...');

        // Send email notification (best-effort, don't let it block messenger)
        try {
          const templates = require('../lib/email-templates');
          const mailer = require('../lib/mailer');
          // If the new status is Delivered, send a friendly delivered/thank-you email
          if (String(updated.status || '').toLowerCase() === 'delivered') {
            console.log('Sending delivered email...');
            const mail = templates.deliveredTemplate(updated);
            await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
            console.log('Delivered email sent successfully');
          } else {
            console.log('Sending status update email...');
            const mail = templates.statusUpdateTemplate(updated, previousStatus);
            await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
            console.log('Status update email sent successfully');
          }
        } catch (emailErr) {
          console.error('Failed to send email (continuing with messenger):', emailErr.message || emailErr);
        }

        console.log('Email done, now checking messenger...');
        // Also attempt to notify the customer via Messenger if they've linked their chat (best-effort)
        try {
          const psid = updated.messenger_psid || updated.customer_psid;
          console.log('Messenger PSID check:', { psid, has_psid: !!psid });
          if (psid) {
            console.log('Sending messenger notification for status:', updated.status, 'to PSID:', psid);
            const mres = await messenger.notifyCustomer(updated);
            console.log('Messenger response:', mres);
            if (mres && mres.ok === false) console.warn('Failed to notify customer via Messenger', mres);
            else console.log('Messenger: customer notification result', mres && mres.status);
          } else {
            console.log('No messenger PSID found, skipping messenger notification');
          }
        } catch (mErr) {
          console.error('Failed to send messenger notification to customer:', mErr);
        }

        // Send push notification to mobile app users
        try {
          console.log('Checking for mobile push token...');
          // Query user's push token from database based on phone or email
          const { data: userTokens, error: tokenError } = await supabase
            .from('user_push_tokens')
            .select('expo_push_token')
            .or(`phone.eq.${updated.customer_phone},email.eq.${updated.email}`)
            .limit(1);

          if (!tokenError && userTokens && userTokens.length > 0 && userTokens[0].expo_push_token) {
            const pushToken = userTokens[0].expo_push_token;
            console.log('Found push token, sending notification...');
            
            const statusMessages = {
              pending: '⏳ Your order is pending confirmation',
              processing: '🌸 Your order is being prepared',
              'to receive': '📦 Your order is ready for pickup/delivery',
              delivered: '✅ Your order has been delivered',
              cancelled: '❌ Your order has been cancelled'
            };

            const title = `Order ${updated.order_id} Update`;
            const body = statusMessages[updated.status.toLowerCase()] || `Status: ${updated.status}`;

            await sendPushNotification(pushToken, title, body, {
              orderId: updated.order_id,
              status: updated.status,
              type: 'status_update'
            });
            console.log('Push notification sent successfully');
          } else {
            console.log('No push token found for user');
          }
        } catch (pushErr) {
          console.error('Failed to send push notification:', pushErr);
        }
      } else {
        console.log('Skipping status notification:', {
          reason: !updated ? 'no updated record' :
                  previousStatus === updated.status ? 'status unchanged' :
                  !updated.email ? 'no email' : 'unknown'
        });
      }
    } catch (outerErr) {
      console.error('Unexpected error in notification flow:', outerErr);
    }

    res.json({ message: 'Order updated successfully', updated: (updatedRows && updatedRows[0]) || null });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Mark order as delivered and send delivered email without persisting transient delivery data
router.post('/orders/:orderId/deliver', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { received, receiverName, deliveredBy, notes } = req.body || {};
    // Fetch existing order
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Order not found' });

    // Update status only (do not persist receiverName or payment_received)
    const { data: updatedRows, error: updateErr } = await supabase.from('orders').update({ status: 'Delivered' }).eq('order_id', orderId).select();
    if (updateErr) throw updateErr;
    const updated = (updatedRows && updatedRows[0]) || existing;

    // Prepare comprehensive delivery details for notifications
    const emailOrder = Object.assign({}, updated);
    if (typeof received !== 'undefined') emailOrder.payment_received = Number(received);
    if (receiverName) emailOrder.receiver_name = String(receiverName);
    if (deliveredBy) emailOrder.delivered_by = String(deliveredBy);
    if (notes) emailOrder.delivery_notes = String(notes);

    // Send delivered email including transient payment/receiver info (best-effort)
    try {
      const templates = require('../lib/email-templates');
      const mailer = require('../lib/mailer');
      if (emailOrder && emailOrder.email) {
        const mail = templates.deliveredTemplate(emailOrder);
        await mailer.sendMail({ to: emailOrder.email, subject: mail.subject, html: mail.html });
        console.log('Delivered email sent successfully to customer');
      }
    } catch (mailErr) {
      console.error('Failed to send delivered email (transient):', mailErr);
    }

    // Also attempt to notify the customer via Messenger (best-effort) when delivered
    try {
      if (updated && (updated.messenger_psid || updated.customer_psid)) {
        const messenger = require('../lib/messenger');
        const notifyPayload = Object.assign({}, updated);
        if (typeof received !== 'undefined') notifyPayload.payment_received = Number(received);
        if (receiverName) notifyPayload.receiver_name = String(receiverName);
        if (deliveredBy) notifyPayload.delivered_by = String(deliveredBy);
        if (notes) notifyPayload.delivery_notes = String(notes);
        console.log('Sending delivery notification with payload:', {
          orderId: notifyPayload.order_id,
          receiverName: notifyPayload.receiver_name,
          paymentReceived: notifyPayload.payment_received,
          deliveredBy: notifyPayload.delivered_by,
          notes: notifyPayload.delivery_notes
        });
        const mres = await messenger.notifyCustomer(notifyPayload);
        if (mres && mres.ok === false) console.warn('Failed to notify customer via Messenger (deliver):', mres);
        else console.log('Messenger: delivered notification sent to customer');
      }
    } catch (mErr) {
      console.warn('Failed to send messenger notification to customer (deliver):', mErr && mErr.message ? mErr.message : mErr);
    }

    res.json({ message: 'Order marked as Delivered', updated: updated });
  } catch (err) {
    console.error('deliver endpoint error:', err);
    res.status(500).json({ error: 'Failed to mark delivered' });
  }
});

// Get audit history for an order
router.get('/orders/:orderId/audits', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data, error } = await supabase.from('order_audits').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Failed to fetch audits:', err);
    res.status(500).json({ error: 'Failed to fetch audit history' });
  }
});

router.delete('/orders/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log('Attempting to delete order:', orderId);
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('order_id', orderId)
      .select();
    if (error) {
      console.error('Supabase delete error:', error);
      throw error;
    }
    console.log('Supabase delete success:', data);
    // Audit log: record deletion with snapshot
    try {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const snapshot = (data && data[0]) || null;
      const audit = { order_id: orderId, admin_email: adminEmail, action: 'delete', snapshot };
      await supabase.from('order_audits').insert([audit]);
    } catch (auditErr) {
      console.warn('Failed to write delete audit:', auditErr);
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Admin: list reviews (protected)
router.get('/reviews', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id,order_id,name,stars,message,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching reviews (admin):', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// --- Legacy messenger-specific admin endpoints (operate on unified `admins` table) ---
// List messenger-capable admins (pending and approved)
router.get('/admins/messenger', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('admins').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    // Only include rows that have a PSID (these are messenger-capable records)
    const messengerRows = (data || []).filter(r => r && r.psid);
    const pending = messengerRows.filter(r => String(r.status || '').toLowerCase() !== 'approved');
    const approved = messengerRows.filter(r => String(r.status || '').toLowerCase() === 'approved');
    res.json({ pending, approved });
  } catch (err) {
    console.error('Failed to list messenger-capable admins:', err);
    res.status(500).json({ error: 'Failed to list messenger admins' });
  }
});

// Approve a messenger admin (by PSID)
router.patch('/admins/messenger/:psid/approve', auth, async (req, res) => {
  try {
    const { psid } = req.params;
    if (!psid) return res.status(400).json({ error: 'psid required' });
    const { data, error } = await supabase.from('admins').update({ status: 'Approved', approved_at: new Date().toISOString() }).eq('psid', String(psid)).select();
    if (error) throw error;
    res.json({ ok: true, updated: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to approve messenger admin:', err);
    res.status(500).json({ error: 'Failed to approve messenger admin' });
  }
});

// Delete/reject a messenger admin (by PSID)
router.delete('/admins/messenger/:psid', auth, async (req, res) => {
  try {
    const { psid } = req.params;
    if (!psid) return res.status(400).json({ error: 'psid required' });
    const { data, error } = await supabase.from('admins').delete().eq('psid', String(psid)).select();
    if (error) throw error;
    res.json({ ok: true, removed: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to delete messenger admin:', err);
    res.status(500).json({ error: 'Failed to delete messenger admin' });
  }
});

// Create or upsert a messenger-capable admin manually (psid)
router.post('/admins/messenger', auth, async (req, res) => {
  try {
    const { psid, name, status } = req.body || {};
    if (!psid) return res.status(400).json({ error: 'psid is required' });
    const rec = { psid: String(psid), name: name || null, status: status || 'Approved', created_at: new Date().toISOString() };
    const { data, error } = await supabase.from('admins').upsert([rec], { onConflict: ['psid'] }).select();
    if (error) throw error;
    res.json({ ok: true, result: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to create/upsert messenger admin (admins table):', err);
    res.status(500).json({ error: 'Failed to create messenger admin' });
  }
});

// --- Admin accounts management (email/password) ---

// List admins (do not return password_hash)
router.get('/admins', auth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('admins').select('id,email,psid,name,status,created_at').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ admins: data || [] });
  } catch (err) {
    console.error('Failed to list admins:', err);
    res.status(500).json({ error: 'Failed to list admins' });
  }
});

// Create an admin account (store salted scrypt password hash as salt$hash)
router.post('/admins', auth, async (req, res) => {
  try {
    const { email, password, name, psid, status } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const password_hash = `${salt}$${derived}`;
    const record = { 
      email: String(email).trim().toLowerCase(), 
      password_hash,
      name: name ? String(name).trim() : null,
      psid: psid ? String(psid).trim() : null,
      status: status || 'Not Approved'
    };
    const { data, error } = await supabase.from('admins').insert([record]).select('id,email,name,psid,status,created_at');
    if (error) throw error;
    res.json({ ok: true, admin: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to create admin account:', err);
    res.status(500).json({ error: 'Failed to create admin account' });
  }
});

// Update admin fields (name, psid, email, status)
router.patch('/admins/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id is required' });
    const allowed = ['name','psid','email','status'];
    const updates = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
    const { data, error } = await supabase.from('admins').update(updates).eq('id', id).select('id,email,psid,name,status,created_at');
    if (error) throw error;
    res.json({ ok: true, admin: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to update admin:', err);
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

// Update admin password
router.patch('/admins/:id/password', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!id || !password) return res.status(400).json({ error: 'id and new password are required' });
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const password_hash = `${salt}$${derived}`;
    const { data, error } = await supabase.from('admins').update({ password_hash }).eq('id', id).select('id,email,created_at');
    if (error) throw error;
    res.json({ ok: true, admin: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to update admin password:', err);
    res.status(500).json({ error: 'Failed to update admin password' });
  }
});

// Delete admin account
router.delete('/admins/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await supabase.from('admins').delete().eq('id', id).select('id,email');
    if (error) throw error;
    res.json({ ok: true, removed: data && data[0] ? data[0] : null });
  } catch (err) {
    console.error('Failed to delete admin:', err);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// Admin: delete review by id (protected)
router.delete('/reviews/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'ID is required' });
    const { data, error } = await supabase.from('reviews').delete().eq('id', id).select('id,order_id,name');
    if (error) throw error;
    res.json({ message: 'Review deleted', review: data && data[0] ? data[0] : null });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// ------------------
// Products CRUD (protected)
// Expects a Supabase table named `products` with columns: id, name, image_url, image_path, category, pricing (jsonb), addons (jsonb)

// Create product
router.post('/products', auth, async (req, res) => {
  try {
    const { name, image_url, image_path, category, pricing, addons, colors } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const record = { name, image_url: image_url || null, image_path: image_path || null, category: category || null, pricing: pricing || null, addons: addons || null, colors: colors || null };

    // Support legacy base64 payload under `image_data` if present in body
    const image_data = req.body.image_data || req.body.file || req.body.image;
    if (image_data && String(image_data).startsWith('data:')) {
      try {
        const { publicUrl, path } = await uploadBase64ToStorage(image_data);
        record.image_url = publicUrl;
        record.image_path = path;
      } catch (err) {
        console.error('Failed to upload image_data:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

  // Insert and explicitly request only known columns to avoid schema cache issues
  console.log('Admin: creating product with payload keys:', Object.keys(record));
  console.log('Admin: creating product record (preview):', JSON.stringify(record).slice(0,1000));
    try {
  const { data, error } = await supabase.from('products').insert([record]).select('id,name,image_url,image_path,category,pricing,addons,colors,created_at');
      if (error) throw error;
      console.log('Admin: insert result:', data && data[0] ? JSON.stringify(data[0]) : String(data));
      return res.json(data[0]);
    } catch (err) {
      console.error('Insert error, attempting minimal fallback:', err);
      if (err && err.code === 'PGRST204') {
        // PostgREST schema cache mismatch — perform insert with minimal returning to avoid selecting unknown columns
        const { error: fallbackErr } = await supabase.from('products').insert([record], { returning: 'minimal' });
        if (fallbackErr) {
          console.error('Fallback insert failed:', fallbackErr);
          throw fallbackErr;
        }
        return res.json({ message: 'Product created (no representation due to schema mismatch). Refresh product list.' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// multipart upload endpoint (accepts form-data file under `file`) -> uploads to storage and returns { url, path }
router.post('/products/upload', auth, upload.single('file'), async (req, res) => {
  try {
    console.log('Upload endpoint called. content-type:', req.headers['content-type']);
    const file = req.file;
    if (!file) {
      console.warn('No multipart file found in request. Checking for base64 payload in body...');
      // sometimes client may send base64 in the body under `file` or `image_data`
      const possible = req.body.file || req.body.image_data || req.body.image;
      if (possible && String(possible).startsWith('data:')) {
        try {
          const { publicUrl, path } = await uploadBase64ToStorage(possible);
          return res.json({ url: publicUrl, path });
        } catch (err) {
          console.error('Failed uploading base64 fallback:', err);
          return res.status(500).json({ error: 'Failed to upload base64 payload' });
        }
      }
      console.log('Request body keys:', Object.keys(req.body || {}));
      return res.status(400).json({ error: 'File is required (no multipart file and no base64 payload found)' });
    }

    // SECURITY FIX: Validate file type with whitelist
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
    }
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    console.log('Received multipart file:', { originalname: file.originalname, size: file.size, mimetype: file.mimetype });
    const ext = (file.mimetype && file.mimetype.split('/')[1]) || 'png';
    // SECURITY FIX: Use crypto.randomBytes instead of Math.random
    const filename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const path = `products/${filename}`;
    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: uploadError.message || 'Failed to upload file' });
    }
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    res.json({ url: data.publicUrl, path });
  } catch (error) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Update product
router.patch('/products/:id', auth, async (req, res) => {
  try {
  const { id } = req.params;
  const { name, image_url, image_path, category, pricing, addons, colors } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    
    if (image_url !== undefined) updates.image_url = image_url;
    if (image_path !== undefined) updates.image_path = image_path;
    if (category !== undefined) updates.category = category;
    if (pricing !== undefined) updates.pricing = pricing;
    if (addons !== undefined) updates.addons = addons;
  if (colors !== undefined) updates.colors = colors;

    // Support legacy base64 payload under `image_data` if present in body
    const image_data = req.body.image_data || req.body.file || req.body.image;
    if (image_data && String(image_data).startsWith('data:')) {
      try {
        const { publicUrl, path } = await uploadBase64ToStorage(image_data);
        updates.image_url = publicUrl;
        updates.image_path = path;
      } catch (err) {
        console.error('Failed to upload image_data:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    try {
      console.log('Admin: updating product id=', id, 'updates keys:', Object.keys(updates));
      console.log('Admin: updates preview:', JSON.stringify(updates).slice(0,1000));
      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('id,name,image_url,image_path,category,pricing,addons,colors,created_at');
      if (error) throw error;
      console.log('Admin: update result:', data && data[0] ? JSON.stringify(data[0]) : String(data));
      return res.json(data[0]);
    } catch (err) {
      console.error('Update error, attempting minimal fallback:', err);
      if (err && err.code === 'PGRST204') {
        const { error: fallbackErr } = await supabase.from('products').update(updates).eq('id', id).select();
        if (fallbackErr) {
          console.error('Fallback update also failed:', fallbackErr);
          throw fallbackErr;
        }
        return res.json({ message: 'Product updated (no representation due to schema mismatch). Refresh product list.' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    // attempt to fetch the product to get image_path so we can delete the object from storage
    const { data: found, error: fetchErr } = await supabase.from('products').select('*').eq('id', id).single();
    if (fetchErr && fetchErr.code !== 'PGRST101') {
      console.error('Error fetching product before delete:', fetchErr);
    }
    if (found && found.image_path) {
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([found.image_path]);
      } catch (remErr) {
        console.error('Failed to remove storage object:', remErr);
      }
    }

    try {
      const { data, error } = await supabase.from('products').delete().eq('id', id).select('id,name,image_url,image_path,category,pricing,addons,created_at');
      if (error) throw error;
      return res.json({ message: 'Product deleted', product: data[0] });
    } catch (err) {
      console.error('Delete error, attempting minimal fallback:', err);
      if (err && err.code === 'PGRST204') {
        const { error: fallbackErr } = await supabase.from('products').delete().eq('id', id).select();
        if (fallbackErr) {
          console.error('Fallback delete failed:', fallbackErr);
          throw fallbackErr;
        }
        return res.json({ message: 'Product deleted (no representation due to schema mismatch).' });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;