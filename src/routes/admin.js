const express = require('express');
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const { validateOrderStatus, validateProduct, sanitizeBody } = require('../middleware/validators');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
// Push notifications disabled. Stub function kept so existing callers remain safe.
const push = require('../lib/push-notifications');
const mailer = require('../lib/mailer');

function escapeHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // limit uploads to 5MB
});
const router = express.Router();
const fs = require('fs');
const messenger = require('../lib/messenger');
const { setSession } = require('../lib/sessionStore');
const { clearCache } = require('../middleware/cache');
const path = require('path');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const NOTIF_STATE_FILE = path.join(__dirname, '..', 'data', 'notifications_state.json');

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

// Helper function to broadcast messages to all customers
async function broadcastToAllCustomers(message, productId = null) {
  try {
    // Get all customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('id');
    
    if (customersError) {
      console.error('Error fetching customers for broadcast:', customersError);
      return;
    }
    
    if (!customers || customers.length === 0) {
      console.log('No customers found to broadcast message');
      return;
    }
    
    // Prepare messages for all customers
    const messages = customers.map(customer => ({
      customer_id: customer.id,
      sender_type: 'seller',
      message: message,
      product_id: productId,
      created_at: new Date().toISOString()
    }));
    
    // Insert all messages into customer_messages table
    const { error: messagesError } = await supabase
      .from('customer_messages')
      .insert(messages);
    
    if (messagesError) {
      console.error('Error broadcasting messages to customers:', messagesError);
      return;
    }
    
    console.log(`Broadcast message sent to ${customers.length} customers`);
    
    // Send push notifications via push_subscriptions
    try {
      const { data: tokens } = await supabase
        .from('push_subscriptions')
        .select('subscription,endpoint')
        .not('subscription', 'is', null)
        .eq('user_type', 'customer');

      if (tokens && tokens.length) {
        const msgs = tokens
          .map(t => {
            const sub = t && t.subscription ? t.subscription : (t && t.endpoint ? { endpoint: t.endpoint } : null);
            return sub ? ({ subscription: sub, payload: { title: 'New product available', body: message, data: { type: 'product', product_id: productId } } }) : null;
          })
          .filter(Boolean);

        const chunk = (arr, size) => { const out=[]; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };
        const batches = chunk(msgs, 100);
        for (const b of batches) {
          try {
            const results = await push.sendBatchWebPush(b);
            console.log('Product push batch results:', results);
          } catch (pe) { console.warn('Failed sending product push batch:', pe); }
        }
      }
    } catch (pe) { console.warn('Product broadcast push error:', pe); }

    // Send product announcement emails (best-effort)
    try {
      const { data: emails } = await supabase.from('customers').select('email').not('email', 'is', null);
      if (emails && emails.length) {
        const subject = `Chammy Florals - ${escapeHtml(String(message)).slice(0,60)}`;
        const html = `<div style="font-family:Arial,sans-serif;color:#333"><h2 style="color:#ff69b4">New Product Available</h2><div>${escapeHtml(String(message))}</div><p style="color:#666;font-size:0.9em">Visit our shop to see details.</p></div>`;
        const batchSize = 100;
        for (let i=0;i<emails.length;i+=batchSize) {
          const batch = emails.slice(i,i+batchSize).map(e => e.email).filter(Boolean);
          await Promise.all(batch.map(to => mailer.sendMail({ to, subject, html }).catch(e => console.warn('Product email failed to', to, e))));
        }
      }
    } catch (me) { console.warn('Product email error:', me); }
  } catch (error) {
    console.error('Error in broadcastToAllCustomers:', error);
  }
}

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
  return { publicUrl: data.publicUrl, path, bucket: STORAGE_BUCKET };
}

// Rate limiting disabled for admin routes
// const LOGIN_RATE_MAX = Number(process.env.ADMIN_LOGIN_MAX || 6);
// const loginLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: LOGIN_RATE_MAX,
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req /*, res*/) => {
//     const xf = req.headers['x-forwarded-for'] || req.headers['forwarded'] || req.headers['x-real-ip'];
//     if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
//     try {
//       return ipKeyGenerator(req.ip);
//     } catch (err) {
//       return req.ip || '';
//     }
//   },
// });

router.post('/login', async (req, res) => {
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
    let adminRow = null;
    
    try {
      const { data: dbAdminRow, error: adminErr } = await supabase
        .from('admins')
        .select('id,email,name,password_hash,totp_secret,totp_enabled,status')
        .eq('email', normEmail)
        .limit(1)
        .single();
      
      if (!adminErr && dbAdminRow && dbAdminRow.email) {
        adminRow = dbAdminRow;
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

    // Success - establish a passport/session-based cookie so client can use cookie auth
    try {
      if (req && req.session) {
        // Store a primitive value (id or email) so Passport's serialize/deserialize
        // flow works correctly and we don't accidentally persist an object into
        // the session which could cause DB queries to receive "[object Object]".
        req.session.passport = { user: (adminId ? adminId : normEmail) };
        // populate req.user for the immediate request lifecycle (non-persistent)
        req.user = (adminId ? { id: adminId, email: normEmail } : { email: normEmail });
      }
    } catch (se) {
      console.warn('Failed to set session on admin login:', se && se.message ? se.message : se);
    }

    // Success - return token
    res.json({
      token,
      user: { email: normEmail, name: adminRow?.name || 'Admin', role: 'admin' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to process login' });
  }
});

// Setup TOTP - Enable TOTP after scanning QR code
router.post('/login/enable-totp', async (req, res) => {
  try {
    const { email, password, totp } = req.body;
    if (!email || !password || !totp) {
      return res.status(400).json({ error: 'Email, password, and TOTP code are required' });
    }

    const normEmail = String(email).trim().toLowerCase();
    
    // Verify password first
    const { data: adminRow, error: adminErr } = await supabase
      .from('admins')
      .select('id,email,name,password_hash,totp_secret,totp_enabled')
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
      user: { email: normEmail, name: adminRow?.name || 'Admin', role: 'admin' },
      message: 'Google Authenticator enabled successfully'
    });
  } catch (error) {
    console.error('Enable TOTP error:', error);
    res.status(500).json({ error: 'Failed to enable TOTP' });
  }
});

// Verify 2FA code and issue token (kept for backwards compatibility, but now unused)
router.post('/login/verify', async (req, res) => {
  res.status(404).json({ error: 'This endpoint is deprecated. Use Google Authenticator instead.' });
});

// Old verify endpoint - remove after migration
router.post('/login/verify-old', async (req, res) => {
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

// POST /api/admin/session/refresh
// If the request carries a valid passport/cookie session this will
// create a new `session_token` in the `admins` table and return it so
// client-side code (e.g. admin UI) can populate `localStorage.adminToken`.
router.post('/session/refresh', auth, async (req, res) => {
  try {
    // auth middleware will populate req.admin for cookie or other valid sessions
    const adminEmail = (req.admin && req.admin.email) || (req.user && req.user.email) || null;
    if (!adminEmail) return res.status(401).json({ error: 'Not authenticated' });

    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString(); // 8 hours

    // Persist to DB (best-effort)
    try {
      await supabase.from('admins').update({ session_token: sessionToken, session_expires: sessionExpiresAt }).eq('email', String(adminEmail).trim().toLowerCase());
    } catch (e) {
      console.warn('Failed to persist refreshed session token to DB (best-effort):', e && e.message ? e.message : e);
    }

    // Populate in-memory session store so the token is usable immediately
    try { setSession(sessionToken, adminEmail, new Date(sessionExpiresAt).getTime()); } catch (e) { /* ignore */ }

    return res.json({ token: sessionToken, expires: sessionExpiresAt });
  } catch (err) {
    console.error('Session refresh error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to refresh session' });
  }
});

// Cookie consent endpoint removed - cookie consent UI cleaned from client.

// Dashboard stats
router.get('/dashboard', auth, async (req, res) => {
  try {
    console.log('Dashboard endpoint hit by:', req.headers.authorization ? 'authenticated user' : 'unauthenticated');
    const { data: orders, error: ordersError } = await supabase.from('orders').select('status, total_fee');
    if (ordersError) {
      console.error('Supabase orders query error:', ordersError);
      throw ordersError;
    }

    console.log('Orders fetched successfully:', orders?.length || 0);
    const stats = {
      total_orders: orders?.length || 0,
      pending_orders: orders?.filter(o => o.status === 'Todo').length || 0,
      completed_orders: orders?.filter(o => o.status === 'Delivered').length || 0,
      total_revenue: orders?.reduce((sum, o) => sum + (parseFloat(o.total_fee) || 0), 0) || 0,
    };

    console.log('Dashboard stats calculated:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

router.get('/orders', auth, async (req, res) => {
  try {
    // Helper function to safely parse array fields
    const safeArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    // Fetch regular orders
    const { data: regularOrders, error: regularError } = await supabase
      .from('orders')
      .select('*');
    
    if (regularError) throw regularError;

    // Fetch custom orders
    const { data: customOrders, error: customError } = await supabase
      .from('custom_orders')
      .select('*');

    if (customError) {
      console.error('Error fetching custom orders:', customError);
      // Continue with regular orders even if custom orders fail
    }

    // Combine and normalize both order types
    const allOrders = [
      ...(regularOrders || []).map(order => ({
        ...order,
        order_type: 'regular',
        orderId: order.order_id,
        items: order.items || []
      })),
      ...(customOrders || []).map(order => {
        const stems = safeArray(order.stems);
        const fillers = safeArray(order.fillers);
        const wrapping = safeArray(order.wrapping);
        const addons = safeArray(order.addons);

        return {
          ...order,
          order_type: 'custom',
          orderId: order.order_id,
          flower_type: 'Custom Bouquet',
          // Combine stems, fillers, wrapping as items for display
          items: [
            ...stems.map(s => ({ name: s.name, price: s.price, type: 'stem' })),
            ...fillers.map(f => ({ name: f.name, price: f.price, type: 'filler' })),
            ...wrapping.map(w => ({ name: w.name, price: w.price, type: 'wrapping' })),
            ...addons.map(a => ({ name: a.name, price: a.price, type: 'addon' }))
          ]
        };
      })
    ];

    // Sort by created_at (newest first)
    allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(allOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ============================================
// Custom Orders Management Endpoints
// IMPORTANT: Must be before /orders/:orderId to avoid route collision
// ============================================

// GET all custom orders
router.get('/orders/custom', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('custom_orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ orders: data || [] });
  } catch (err) {
    console.error('Error fetching custom orders:', err);
    res.status(500).json({ error: 'Failed to fetch custom orders' });
  }
});

// GET single custom order by order_id
router.get('/orders/custom/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const { data, error } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching custom order:', err);
    res.status(500).json({ error: 'Failed to fetch custom order' });
  }
});

// UPDATE custom order status
router.put('/orders/custom/:orderId/status', auth, validateOrderStatus, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ error: 'Order ID and status are required' });
    }
    
    const { data, error } = await supabase
      .from('custom_orders')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Send notification email to customer (best effort)
    try {
      if (data.email) {
        const statusEmojis = {
          'Pending': '⏳',
          'Processing': '🔄',
          'Ready': '✅',
          'Delivered': '🎉',
          'Cancelled': '❌'
        };
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
              <h2 style="margin: 0;">Order Status Update ${statusEmojis[status] || '📦'}</h2>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${data.name}</strong>,</p>
              <p>Your custom order <strong>${orderId}</strong> status has been updated to:</p>
              <div style="background: #ff6f9b; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <strong style="font-size: 24px;">${status}</strong>
              </div>
              ${status === 'Ready' ? '<p>Your order is ready for pickup or delivery! We will contact you shortly.</p>' : ''}
              ${status === 'Delivered' ? '<p>Thank you for your order! We hope you love your custom bouquet. 💐</p>' : ''}
              ${status === 'Cancelled' ? '<p>If you have any questions, please contact us.</p>' : ''}
              <p style="color: #666; font-size: 14px; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                For any questions, feel free to reach out to us.
              </p>
              <p style="color: #ff6f9b; text-align: center; font-weight: bold;">Thank you for choosing Chammy Florals! 🌸</p>
            </div>
          </div>
        `;
        
        await mailer.sendMail({
          to: data.email,
          subject: `Order Status Update - ${orderId}`,
          html: emailHtml
        });
      }
    } catch (mailErr) {
      console.error('Failed to send status update email:', mailErr);
    }
    
    res.json({ success: true, order: data });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Failed to update order status' });
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
    
    // Default to last 12 months if no from date specified
    const defaultFrom = new Date();
    defaultFrom.setMonth(defaultFrom.getMonth() - 11);
    const startDate = from ? new Date(from).toISOString() : defaultFrom.toISOString();
    const endDate = to ? new Date(to).toISOString() : null;

    // Query regular orders
    const regularQuery = supabase
      .from('orders')
      .select('order_id,name,total_fee,created_at,status')
      .gte('created_at', startDate)
      .order('created_at', { ascending: true });
    
    if (endDate) regularQuery.lte('created_at', endDate);

    // Query custom orders
    const customQuery = supabase
      .from('custom_orders')
      .select('order_id,name,total_fee,created_at,status')
      .gte('created_at', startDate)
      .order('created_at', { ascending: true });
    
    if (endDate) customQuery.lte('created_at', endDate);

    const [regularResult, customResult] = await Promise.all([regularQuery, customQuery]);

    if (regularResult.error) throw regularResult.error;

    // Combine regular and custom orders
    const allOrders = [
      ...(regularResult.data || []).map(o => ({ ...o, order_type: 'regular' })),
      ...(customResult.data || []).map(o => ({ ...o, order_type: 'custom' }))
    ];

    // Sort by created_at
    allOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // compute total revenue from delivered orders and return list of delivered orders
    let total = 0;
    const deliveredOrders = allOrders.filter(o => String(o.status || '').toLowerCase() === 'delivered');
    for (const o of deliveredOrders) {
      total += Number(o.total_fee) || 0;
    }
    
    // return minimal fields for display
    const rows = deliveredOrders.map(o => ({ 
      order_id: o.order_id, 
      name: o.name, 
      total_fee: Number(o.total_fee) || 0, 
      created_at: o.created_at,
      order_type: o.order_type 
    }));
    
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
      .select('id,name,image_url,image_path,category,pricing,addons,colors,images,images_paths,created_at')
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
  const allowed = ['name','email','fb_link','flower_type','quantity','addons','message','rush','total_fee','status','items','created_at','expected_delivery_date'];
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
            
            // Delete chat messages for this order since it's delivered
            try {
              const { error: deleteChatError } = await supabase
                .from('order_chats')
                .delete()
                .eq('order_id', orderId);
              
              if (deleteChatError) {
                console.error('Failed to delete chat messages for delivered order:', deleteChatError);
              } else {
                console.log('Chat messages deleted for delivered order:', orderId);
              }
            } catch (chatErr) {
              console.error('Error deleting chat messages:', chatErr);
            }
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

        // Push notifications disabled — skipping mobile push sends
        console.log('Push notifications disabled; skipping mobile push send for this update');
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
    const { received, receiverName, deliveredBy, notes, payment_method } = req.body || {};
    console.log('Deliver endpoint called for order:', orderId, 'payload:', { received, receiverName, deliveredBy, notes, payment_method });
    // Fetch existing order
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Order not found' });

    // Update status and persist payment_method when provided
    const updatePayload = { status: 'Delivered' };
    if (typeof payment_method !== 'undefined' && payment_method !== null) updatePayload.payment_method = String(payment_method);

    const { data: updatedRows, error: updateErr } = await supabase.from('orders').update(updatePayload).eq('order_id', orderId).select();
    console.log('Supabase update result for deliver:', { updatedRows, updateErr });
    if (updateErr) throw updateErr;
    const updated = (updatedRows && updatedRows[0]) || existing;

    // Prepare comprehensive delivery details for notifications
    const emailOrder = Object.assign({}, updated);
    if (typeof received !== 'undefined') emailOrder.payment_received = Number(received);
    if (receiverName) emailOrder.receiver_name = String(receiverName);
    if (deliveredBy) emailOrder.delivered_by = String(deliveredBy);
    if (notes) emailOrder.delivery_notes = String(notes);
    if (typeof payment_method !== 'undefined' && payment_method !== null) emailOrder.payment_method = String(payment_method);

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
        if (typeof payment_method !== 'undefined' && payment_method !== null) notifyPayload.payment_method = String(payment_method);
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

    // Push notifications disabled — skipping mobile push sends for delivery notifications
    console.log('Push notifications disabled; skipping mobile push send for delivery notification');

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

    // fetch review to determine if there's an image to remove
    const { data: found, error: fetchErr } = await supabase.from('reviews').select('id,order_id,name,image_url').eq('id', id).single();
    if (fetchErr || !found) return res.status(404).json({ error: 'Review not found' });

    // if image_url present, try to remove the storage object
    if (found.image_url) {
      console.log('Attempting to remove review image for review id=', id, 'order_id=', found.order_id);
      try {
        const tried = [];
        const bucketEnv = process.env.SUPABASE_REVIEWS_BUCKET || 'reviews';
        // parse url to extract bucket and path if possible
        let parsedBucket = null;
        let parsedPath = null;
        let lastSegment = null;
        try {
          const u = new URL(found.image_url);
          const idx = u.pathname.indexOf('/storage/v1/object/public/');
          if (idx >= 0) {
            const after = u.pathname.slice(idx + '/storage/v1/object/public/'.length);
            const parts = after.split('/').filter(Boolean);
            if (parts.length) {
              parsedBucket = parts[0];
              if (parts.length > 1) parsedPath = parts.slice(1).join('/');
            }
          }
          const segs = u.pathname.split('/').filter(Boolean);
          if (segs.length) lastSegment = segs[segs.length-1];
        } catch (pe) { console.warn('Failed parsing review image_url:', pe); }

        // candidate buckets to try (parsed, env)
        const bucketCandidates = [];
        if (parsedBucket) bucketCandidates.push(parsedBucket);
        if (!bucketCandidates.includes(bucketEnv)) bucketCandidates.push(bucketEnv);

        // candidate paths to try
        const pathCandidates = [];
        if (parsedPath) pathCandidates.push(parsedPath);
        // if image stored under order_id/<filename>
        if (found.order_id && lastSegment) pathCandidates.push(`${found.order_id}/${lastSegment}`);
        if (lastSegment) pathCandidates.push(lastSegment);

        console.log('Review image removal - bucketCandidates=', bucketCandidates, 'pathCandidates=', pathCandidates);

        for (let bi = 0; bi < bucketCandidates.length; bi++) {
          const b = bucketCandidates[bi];
          for (let pi = 0; pi < pathCandidates.length; pi++) {
            const p = pathCandidates[pi];
            if (!b || !p) continue;
            const key = `${b}:${p}`;
            if (tried.includes(key)) continue;
            tried.push(key);
            try {
              console.log('Trying to remove', p, 'from bucket', b);
              const { error: remErr } = await supabase.storage.from(b).remove([p]);
              if (!remErr) {
                console.log('Successfully removed review image from storage:', b, p);
                bi = bucketCandidates.length; // break outer
                break;
              } else {
                console.warn('Removal attempt returned error for', b, p, remErr);
              }
            } catch (re) {
              console.warn('Exception while removing', b, p, re && re.message ? re.message : re);
            }
          }
        }
        console.log('Finished storage removal attempts');
      } catch (e) { console.warn('Error during review image removal attempts:', e && e.message ? e.message : e); }
    }

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
    const { name, image_url, image_path, category, pricing, addons, colors, images, images_paths } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const record = { name, image_url: image_url || null, image_path: image_path || null, category: category || null, pricing: pricing || null, addons: addons || null, colors: colors || null, images: images || null, images_paths: images_paths || null };

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
    const { data, error } = await supabase.from('products').insert([record]).select('id,name,image_url,image_path,category,pricing,addons,colors,images,images_paths,created_at');
      if (error) throw error;
      console.log('Admin: insert result:', data && data[0] ? JSON.stringify(data[0]) : String(data));
      
      // Create notifications for all customers about new product
      if (data && data[0]) {
        try {
          const { data: customers } = await supabase
            .from('customers')
            .select('id');
          
          if (customers && customers.length > 0) {
            const notifications = customers.map(customer => ({
              product_id: data[0].id,
              customer_id: customer.id,
              is_read: false
            }));
            
            await supabase
              .from('product_notifications')
              .insert(notifications);
            
            console.log(`Created ${customers.length} product notifications for new product: ${data[0].name}`);
          }
          
          // Broadcast message to all customers about new product
          await broadcastToAllCustomers(
            `🌸 New Product Available: ${data[0].name}`,
            data[0].id
          );
        } catch (notifError) {
          console.error('Failed to create product notifications:', notifError);
          // Don't fail the product creation if notifications fail
        }
      }

      // Clear public product cache so storefront shows updated product immediately
      try { clearCache('/api/products'); clearCache(`/api/products/${data[0].id}`); } catch (e) { console.warn('Failed to clear product cache:', e); }

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
    console.log('Using storage bucket:', STORAGE_BUCKET);
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
    console.log('Upload successful. publicUrl:', data && data.publicUrl, 'path:', path);
    res.json({ url: data.publicUrl, path, bucket: STORAGE_BUCKET });
  } catch (error) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Update product
router.patch('/products/:id', auth, async (req, res) => {
  try {
  const { id } = req.params;
  const { name, image_url, image_path, category, pricing, addons, colors, images, images_paths } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    
    if (image_url !== undefined) updates.image_url = image_url;
    if (image_path !== undefined) updates.image_path = image_path;
    if (category !== undefined) updates.category = category;
    if (pricing !== undefined) updates.pricing = pricing;
    if (addons !== undefined) updates.addons = addons;
  if (colors !== undefined) updates.colors = colors;
    if (images !== undefined) updates.images = images;
    if (images_paths !== undefined) updates.images_paths = images_paths;

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
      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('id,name,image_url,image_path,category,pricing,addons,colors,images,images_paths,created_at');
      if (error) throw error;
      console.log('Admin: update result:', data && data[0] ? JSON.stringify(data[0]) : String(data));
      // Clear public product cache so storefront shows updated product immediately
      try { clearCache('/api/products'); clearCache(`/api/products/${id}`); } catch (e) { console.warn('Failed to clear product cache:', e); }
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
      // attempt to fetch the product to get image_path and images_paths so we can delete the object(s) from storage
      const { data: found, error: fetchErr } = await supabase.from('products').select('*').eq('id', id).single();
    if (fetchErr && fetchErr.code !== 'PGRST101') {
      console.error('Error fetching product before delete:', fetchErr);
    }
    if (found) {
      if (found.image_path) {
        try { await supabase.storage.from(STORAGE_BUCKET).remove([found.image_path]); } catch (remErr) { console.error('Failed to remove storage object:', remErr); }
      }
      if (found.images_paths && Array.isArray(found.images_paths) && found.images_paths.length) {
        try { await supabase.storage.from(STORAGE_BUCKET).remove(found.images_paths.filter(Boolean)); } catch (remErr) { console.error('Failed to remove gallery storage objects:', remErr); }
      }
    }

    try {
      const { data, error } = await supabase.from('products').delete().eq('id', id).select('id,name,image_url,image_path,category,pricing,addons,images,images_paths,created_at');
      if (error) throw error;
      // Clear public product cache so storefront no longer shows deleted product
      try { clearCache('/api/products'); clearCache(`/api/products/${id}`); } catch (e) { console.warn('Failed to clear product cache:', e); }
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

// Delete a single gallery image for a product (remove from storage and update product row)
router.delete('/products/:id/gallery', auth, async (req, res) => {
  try {
    console.log('Gallery delete called:', req.method, req.originalUrl, 'body keys:', Object.keys(req.body || {}));
    const { id } = req.params;
    const { path, url } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Product id is required' });
    if (!path && !url) return res.status(400).json({ error: 'path or url is required' });

    // fetch current product
    const { data: found, error: fetchErr } = await supabase.from('products').select('id,images,images_paths').eq('id', id).single();
    if (fetchErr || !found) return res.status(404).json({ error: 'Product not found' });

    console.log('Gallery delete - product found images count=', (found.images||[]).length, 'paths count=', (found.images_paths||[]).length);
    console.log('Gallery delete - incoming path,url:', { path, url });

    // attempt to remove storage object if path provided
    if (path) {
      // If path was saved with a bucket prefix like "bucket:products/abc.png", split it
      let targetBucket = null;
      let realPath = path;
      if (typeof path === 'string' && path.includes(':')) {
        const splitIdx = path.indexOf(':');
        const maybeBucket = path.slice(0, splitIdx);
        const maybePath = path.slice(splitIdx + 1);
        if (maybeBucket && maybePath) {
          targetBucket = maybeBucket;
          realPath = maybePath;
        }
      }

      // Helper to parse bucket name from a Supabase public URL
      const parseBucketFromUrl = (u) => {
        try {
          const parsed = new URL(u);
          const idx = parsed.pathname.indexOf('/storage/v1/object/public/');
          if (idx >= 0) {
            const after = parsed.pathname.slice(idx + '/storage/v1/object/public/'.length);
            const parts = after.split('/');
            if (parts && parts.length) return parts[0];
          }
        } catch (e) {}
        return null;
      };

      const bucketsToTry = [];
      if (targetBucket) bucketsToTry.push(targetBucket);
      if (url) {
        const b = parseBucketFromUrl(url);
        if (b && !bucketsToTry.includes(b)) bucketsToTry.push(b);
      }
      if (!bucketsToTry.includes(STORAGE_BUCKET)) bucketsToTry.push(STORAGE_BUCKET);

      for (const b of bucketsToTry) {
        try {
          const { error: remErr } = await supabase.storage.from(b).remove([realPath]);
          if (!remErr) {
            console.log('Removed storage object', realPath, 'from bucket', b);
            break;
          } else {
            console.warn('Failed to remove storage object from bucket', b, remErr.message || remErr);
          }
        } catch (e) {
          console.warn('Storage remove exception for bucket', b, e && e.message ? e.message : e);
        }
      }
    }

    // compute new arrays without the removed items
    const imagesArr = Array.isArray(found.images) ? found.images.slice() : [];
    const pathsArr = Array.isArray(found.images_paths) ? found.images_paths.slice() : [];

    // determine canonical realPath for matching (strip bucket: prefix if present)
    const canonicalRealPath = (p) => {
      if (!p) return p;
      if (typeof p !== 'string') return p;
      if (p.includes(':')) return p.split(':').slice(1).join(':');
      return p;
    };
    const targetRealPath = canonicalRealPath(path);

    // Remove from images: match exact url, or any image url that contains the real path
    let newImages = imagesArr.filter(i => {
      if (!i) return false;
      if (url && i === url) return false;
      if (targetRealPath && String(i).includes(targetRealPath)) return false;
      // also try decoded path
      try { if (targetRealPath && decodeURIComponent(String(i)).includes(targetRealPath)) return false; } catch (e) {}
      return true;
    });

    // Remove from paths: match exact stored string, or match by real path suffix
    let newPaths = pathsArr.filter(p => {
      if (!p) return false;
      if (p === path) return false;
      const pReal = canonicalRealPath(p);
      if (targetRealPath && pReal === targetRealPath) return false;
      if (targetRealPath && pReal && pReal.endsWith(targetRealPath)) return false;
      return true;
    });

    console.log('Gallery delete - newImages count=', newImages.length, 'newPaths count=', newPaths.length);

    // persist the updated arrays
    const updates = {};
    updates.images = newImages;
    updates.images_paths = newPaths;

    const { data: updated, error: updateErr } = await supabase.from('products').update(updates).eq('id', id).select('id,name,images,images_paths');
    if (updateErr) {
      console.error('Failed to update product after gallery delete:', updateErr);
      return res.status(500).json({ error: 'Failed to update product' });
    }

    // clear cache for public products
    try { clearCache('/api/products'); clearCache(`/api/products/${id}`); } catch (e) { console.warn('Failed to clear cache after gallery delete', e); }

    return res.json({ ok: true, product: (updated && updated[0]) || null });
  } catch (err) {
    console.error('Error deleting gallery image:', err);
    res.status(500).json({ error: 'Failed to delete gallery image' });
  }
});

// ============================================
// Custom Orders Management Endpoints
// ============================================

// GET all custom orders
router.get('/orders/custom', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('custom_orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ orders: data || [] });
  } catch (err) {
    console.error('Error fetching custom orders:', err);
    res.status(500).json({ error: 'Failed to fetch custom orders' });
  }
});

// GET single custom order by order_id
router.get('/orders/custom/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const { data, error } = await supabase
      .from('custom_orders')
      .select('*')
      .eq('order_id', orderId)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(data);
  } catch (err) {
    console.error('Error fetching custom order:', err);
    res.status(500).json({ error: 'Failed to fetch custom order' });
  }
});

// UPDATE custom order status
router.put('/orders/custom/:orderId/status', auth, validateOrderStatus, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ error: 'Order ID and status are required' });
    }
    
    const { data, error } = await supabase
      .from('custom_orders')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Send notification email to customer (best effort)
    try {
      if (data.email) {
        const statusEmojis = {
          'Pending': '⏳',
          'Processing': '🔄',
          'Ready': '✅',
          'Delivered': '🎉',
          'Cancelled': '❌'
        };
        
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
              <h2 style="margin: 0;">Order Status Update ${statusEmojis[status] || '📦'}</h2>
            </div>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px;">
              <p>Hello <strong>${data.name}</strong>,</p>
              <p>Your custom order <strong>${orderId}</strong> status has been updated to:</p>
              <div style="background: #ff6f9b; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <strong style="font-size: 24px;">${status}</strong>
              </div>
              ${status === 'Ready' ? '<p>Your order is ready for pickup or delivery! We will contact you shortly.</p>' : ''}
              ${status === 'Delivered' ? '<p>Thank you for your order! We hope you love your custom bouquet. 💐</p>' : ''}
              ${status === 'Cancelled' ? '<p>If you have any questions, please contact us.</p>' : ''}
              <p style="color: #666; font-size: 14px; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px;">
                For any questions, feel free to reach out to us.
              </p>
              <p style="color: #ff6f9b; text-align: center; font-weight: bold;">Thank you for choosing Chammy Florals! 🌸</p>
            </div>
          </div>
        `;
        
        await mailer.sendMail({
          to: data.email,
          subject: `Order Status Update - ${orderId}`,
          html: emailHtml
        });
      }
    } catch (mailErr) {
      console.error('Failed to send status update email:', mailErr);
    }
    
    res.json({ success: true, order: data });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;

// Admin-only endpoint to trigger reviews storage cleanup (optional dry-run)
// POST /api/admin/reviews/cleanup { dryRun: true }
// Note: this is exported after router to avoid interfering with route order in server.js
router.post('/reviews/cleanup', auth, async (req, res) => {
  try {
    const dryRun = req.body && (req.body.dryRun === true || String(req.body.dryRun) === 'true');
    const BUCKET = process.env.SUPABASE_REVIEWS_BUCKET || 'reviews';

    // fetch order ids
    const { data: rows, error: rowsErr } = await supabase.from('reviews').select('order_id');
    if (rowsErr) throw rowsErr;
    const orderIds = new Set((rows || []).map(r => String(r.order_id)).filter(Boolean));

    // list files
    const allFiles = [];
    let limit = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET).list('', { limit, offset });
      if (error) throw error;
      if (!data || !data.length) break;
      data.forEach(d => { if (d && d.name) allFiles.push(d.name); });
      if (data.length < limit) break;
      offset += limit;
    }

    // group by top-level folder
    const folders = new Map();
    allFiles.forEach(n => {
      const parts = String(n).split('/').filter(Boolean);
      const folder = parts.length ? parts[0] : '';
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(n);
    });

    const orphanFolders = [];
    for (const [folder, files] of folders.entries()) {
      if (!folder) continue;
      if (!orderIds.has(folder)) orphanFolders.push({ folder, files });
    }

    if (dryRun) return res.json({ orphanFoldersCount: orphanFolders.length, orphanFolders });

    const removed = [];
    for (const ofolder of orphanFolders) {
      const batchSize = 100;
      for (let i=0;i<ofolder.files.length;i+=batchSize) {
        const batch = ofolder.files.slice(i, i+batchSize);
        const { error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) console.error('Failed removing batch for folder', ofolder.folder, error);
        else removed.push(...batch);
      }
    }

    return res.json({ removedCount: removed.length, removed });
  } catch (err) {
    console.error('Failed running reviews cleanup:', err);
    return res.status(500).json({ error: 'Cleanup failed', details: err.message || err });
  }
});

// =====================
// CUSTOMIZATION OPTIONS
// =====================

const CUSTOM_TABLES = {
  stems: 'custom_stems',
  fillers: 'custom_fillers',
  wrapping: 'custom_wrapping',
  addons: 'custom_addons'
};

// Helper to validate type parameter
function validateCustomType(type) {
  return CUSTOM_TABLES[type] ? CUSTOM_TABLES[type] : null;
}

// IMPORTANT: Specific routes must come BEFORE parameterized routes to avoid :type matching "upload"

// POST upload image for customization option
router.post('/customization/upload', auth, upload.single('image'), async (req, res) => {
  try {
    console.log('Upload request received:', {
      hasFile: !!req.file,
      body: req.body,
      fileInfo: req.file ? { name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } : null
    });

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { type, itemId } = req.body;
    if (!type || !itemId) {
      console.error('Missing type or itemId:', { type, itemId });
      return res.status(400).json({ error: 'Type and itemId required', received: { type, itemId } });
    }

    // Validate type
    if (!validateCustomType(type)) {
      return res.status(400).json({ error: 'Invalid option type' });
    }

    const file = req.file;
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${type}/${itemId}_${Date.now()}.${fileExt}`;
    const BUCKET = 'customization-images';

    console.log('Attempting upload:', { fileName, bucket: BUCKET, size: file.buffer.length });

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('Storage upload error:', error);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return res.json({ url: urlData.publicUrl, path: fileName });
  } catch (err) {
    console.error('Error uploading image:', err);
    return res.status(500).json({ error: 'Failed to upload image' });
  }
});

// POST delete image from storage
router.post('/customization/delete-image', auth, async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL required' });
    }

    // Extract file path from URL
    const BUCKET = 'customization-images';
    const urlParts = imageUrl.split(`${BUCKET}/`);
    if (urlParts.length < 2) {
      return res.status(400).json({ error: 'Invalid image URL' });
    }

    const filePath = urlParts[1].split('?')[0]; // Remove query params if any

    // Delete from storage
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('Storage delete error:', error);
      return res.status(500).json({ error: 'Failed to delete image' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error deleting image:', err);
    return res.status(500).json({ error: 'Failed to delete image' });
  }
});

// GET all customization options at once
router.get('/customization-options', auth, async (req, res) => {
  try {
    const [stems, fillers, wrapping, addons] = await Promise.all([
      supabase.from('custom_stems').select('*').order('name', { ascending: true }),
      supabase.from('custom_fillers').select('*').order('name', { ascending: true }),
      supabase.from('custom_wrapping').select('*').order('name', { ascending: true }),
      supabase.from('custom_addons').select('*').order('name', { ascending: true })
    ]);

    return res.json({
      stems: stems.data || [],
      fillers: fillers.data || [],
      wrapping: wrapping.data || [],
      addons: addons.data || []
    });
  } catch (err) {
    console.error('Error fetching customization options:', err);
    return res.status(500).json({ error: 'Failed to fetch customization options' });
  }
});

// GET all options of a type
router.get('/customization/:type', auth, async (req, res) => {
  const table = validateCustomType(req.params.type);
  if (!table) return res.status(400).json({ error: 'Invalid option type' });
  
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error(`Error fetching ${req.params.type}:`, err);
    return res.status(500).json({ error: 'Failed to fetch options' });
  }
});

// GET single option by id
router.get('/customization/:type/:id', auth, async (req, res) => {
  const table = validateCustomType(req.params.type);
  if (!table) return res.status(400).json({ error: 'Invalid option type' });
  
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Option not found' });
    return res.json(data);
  } catch (err) {
    console.error(`Error fetching ${req.params.type}/${req.params.id}:`, err);
    return res.status(500).json({ error: 'Failed to fetch option' });
  }
});

// POST create new option
router.post('/customization/:type', auth, async (req, res) => {
  const table = validateCustomType(req.params.type);
  if (!table) return res.status(400).json({ error: 'Invalid option type' });
  
  const { name, price, image_url, is_active } = req.body;
  
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (price === undefined || isNaN(parseFloat(price))) {
    return res.status(400).json({ error: 'Valid price is required' });
  }
  
  try {
    const { data, error } = await supabase
      .from(table)
      .insert({
        name: name.trim(),
        price: parseFloat(price),
        image_url: image_url || null,
        is_active: is_active !== false
      })
      .select()
      .single();
    
    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error(`Error creating ${req.params.type}:`, err);
    return res.status(500).json({ error: 'Failed to create option' });
  }
});

// PUT update option
router.put('/customization/:type/:id', auth, async (req, res) => {
  const table = validateCustomType(req.params.type);
  if (!table) return res.status(400).json({ error: 'Invalid option type' });
  
  const { name, price, image_url, is_active } = req.body;
  
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (price !== undefined) updates.price = parseFloat(price);
  if (image_url !== undefined) updates.image_url = image_url || null;
  if (is_active !== undefined) updates.is_active = is_active;
  
  try {
    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Option not found' });
    return res.json(data);
  } catch (err) {
    console.error(`Error updating ${req.params.type}/${req.params.id}:`, err);
    return res.status(500).json({ error: 'Failed to update option' });
  }
});

// DELETE option
router.delete('/customization/:type/:id', auth, async (req, res) => {
  const table = validateCustomType(req.params.type);
  if (!table) return res.status(400).json({ error: 'Invalid option type' });
  
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error(`Error deleting ${req.params.type}/${req.params.id}:`, err);
    return res.status(500).json({ error: 'Failed to delete option' });
  }
});
// GET rush fee setting
router.get('/settings/rush-fee', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('setting_value')
      .eq('setting_key', 'rush_fee')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    // Default to 50 if not found
    const rushFee = data ? parseFloat(data.setting_value) : 50;
    return res.json({ rushFee });
  } catch (err) {
    console.error('Error fetching rush fee:', err);
    return res.status(500).json({ error: 'Failed to fetch rush fee setting' });
  }
});

// PUT rush fee setting
router.put('/settings/rush-fee', auth, async (req, res) => {
  try {
    const { rushFee } = req.body;
    
    if (rushFee === undefined || rushFee === null || isNaN(rushFee)) {
      return res.status(400).json({ error: 'Invalid rush fee value' });
    }
    
    const fee = parseFloat(rushFee);
    if (fee < 0) {
      return res.status(400).json({ error: 'Rush fee cannot be negative' });
    }
    
    // Upsert the setting
    const { error } = await supabase
      .from('settings')
      .upsert({
        setting_key: 'rush_fee',
        setting_value: fee.toString(),
        description: 'Rush fee amount (in PHP) for orders with delivery dates within 3 days',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      });
    
    if (error) throw error;
    
    return res.json({ success: true, rushFee: fee });
  } catch (err) {
    console.error('Error updating rush fee:', err);
    return res.status(500).json({ error: 'Failed to update rush fee setting' });
  }
});