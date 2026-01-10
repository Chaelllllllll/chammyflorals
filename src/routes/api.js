const express = require('express');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const { validateOrderCreation, validateReview, sanitizeBody } = require('../middleware/validators');
const { cacheMiddleware, clearCache } = require('../middleware/cache');
const { authenticateToken: authenticateCustomer } = require('./auth');
const adminAuth = require('../middleware/auth');
const mailer = require('../lib/mailer');
const templates = require('../lib/email-templates');
const push = require('../lib/push-notifications');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getSession } = require('../lib/sessionStore');

const JWT_SECRET = process.env.JWT_SECRET || 'chamflorals-secret-key-change-in-production';

// Flexible authentication middleware that accepts either customer or admin tokens
const authenticateCustomerOrAdmin = async (req, res, next) => {
  // Debug logging to diagnose auth issues (will print per-request auth context)
  try {
    console.log('authenticateCustomerOrAdmin - incoming', { method: req.method, path: req.path, hasAuthHeader: !!req.headers['authorization'], cookie: req.headers['cookie'] ? 'present' : 'none', sessionPassport: req.session && req.session.passport && req.session.passport.user ? req.session.passport.user : null });
  } catch (e) {}

  // Accept cookie/passport sessions for admins when present (allow admin cookie auth)
  if (req.user && req.user.id) {
    req.admin = { id: req.user.id, email: req.user.email };
    req.userType = 'admin';
    return next();
  }
  if (req.session && req.session.passport && req.session.passport.user) {
    try {
      const stored = req.session.passport.user;
      if (stored && typeof stored === 'object' && stored.id) {
        req.admin = { id: stored.id, email: stored.email };
      } else {
        req.admin = { id: stored };
      }
      req.userType = 'admin';
      return next();
    } catch (e) {
      // fall through to header/token checks
    }
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  // Try admin session token authentication first (prefer admin when token could be admin session)
  try {
    const tokenStr = String(token || '').trim();
    // Check in-memory session first
    const rec = getSession(tokenStr);
    if (rec && rec.expires && rec.expires > Date.now()) {
      req.admin = rec.admin || { id: rec.adminId };
      req.user = { id: null }; // Set dummy user for admin orders
      req.userType = 'admin';
      return next();
    }

    // Check database session
    const { data: sessionRow, error: sessErr } = await supabase
      .from('admins')
      .select('id,email,session_expires')
      .eq('session_token', tokenStr)
      .limit(1)
      .single();
      
    if (!sessErr && sessionRow && sessionRow.session_expires && 
        new Date(sessionRow.session_expires).getTime() > Date.now()) {
      req.admin = { id: sessionRow.id, email: sessionRow.email };
      req.user = { id: null }; // Set dummy user for admin orders
      req.userType = 'admin';
      return next();
    }
  } catch (err) {
    // Admin auth attempt failed, fall back to customer JWT
  }

  // Try customer JWT authentication
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded && decoded.id) {
      req.user = decoded;
      req.userType = 'customer';
      return next();
    }
  } catch (err) {
    // Not a customer JWT
  }

  return res.status(403).json({ error: 'Invalid or expired token' });
};

// Health check endpoint to verify API and database connectivity
// Returns minimal info - safe for public access
router.get('/health', async (req, res) => {
  try {
    const checks = {
      status: 'OK',
      timestamp: new Date().toISOString(),
    };
    
    // Test database connection (don't expose error details in production)
    try {
      const { data, error } = await supabase.from('products').select('id').limit(1);
      checks.database = error ? 'ERROR' : 'OK';
    } catch (dbErr) {
      checks.database = 'ERROR';
    }
    
    res.json(checks);
  } catch (err) {
    res.status(500).json({ 
      status: 'ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// DEBUG: auth context endpoint (temporary) - returns which auth was detected for the request
// Usage: fetch('/api/auth/debug', { credentials: 'include' })
router.get('/auth/debug', authenticateCustomerOrAdmin, async (req, res) => {
  try {
    return res.json({ ok: true, userType: req.userType || null, user: req.user || null, admin: req.admin || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to inspect auth' });
  }
});

// Verify an admin session token (used by client to validate stored adminToken)
router.post('/admin/verify-token', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'token is required' });

    const tokenStr = String(token || '').trim();

    // Check in-memory session store first
    try {
      const rec = getSession(tokenStr);
      if (rec && rec.expires && rec.expires > Date.now()) {
        return res.json({ ok: true });
      }
    } catch (e) {}

    // Check database session token in admins table
    try {
      const { data: sessionRow, error: sessErr } = await supabase
        .from('admins')
        .select('id,session_expires')
        .eq('session_token', tokenStr)
        .limit(1)
        .single();

      if (!sessErr && sessionRow && sessionRow.session_expires && new Date(sessionRow.session_expires).getTime() > Date.now()) {
        return res.json({ ok: true });
      }
    } catch (e) {}

    return res.status(401).json({ ok: false, error: 'invalid_or_expired' });
  } catch (err) {
    console.error('admin/verify-token error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// use memory storage so we can upload the buffer to Supabase storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// SECURITY FIX: Use cryptographically secure random for order IDs
const generateOrderId = () => {
  // Generate 8 alphanumeric characters from crypto.randomBytes (more secure than Math.random)
  // Use hex encoding to ensure we always get enough characters
  let id = '';
  while (id.length < 8) {
    id += crypto.randomBytes(6).toString('hex').toUpperCase();
  }
  return id.substring(0, 8);
};

// SECURITY FIX: Input sanitization helper
const sanitizeString = (str, maxLength = 1000) => {
  if (!str) return '';
  // Remove HTML tags and limit length
  return String(str).replace(/<[^>]*>/g, '').trim().substring(0, maxLength);
};

// Apply a stricter rate limit to the public inquiry endpoint to mitigate abuse.
// Skip rate limiting for admin users
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting if user is authenticated as admin
    return req.userType === 'admin';
  },
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

router.post('/inquiry', authenticateCustomerOrAdmin, validate.inquiry, sanitizeBody, inquiryLimiter, async (req, res) => {
  try {
    // Log minimal info to avoid leaking PII in logs
    const safeEmail = (req.body.user_email || '').replace(/(.{2}).+(@.+)/, '$1***$2');
    
    // Check what we're receiving
    console.log('Received inquiry request with manual_order:', req.body.manual_order, 'type:', typeof req.body.manual_order);
    console.log('User type:', req.userType);
    
    // Get customer_id from authenticated user (null for admin-created orders)
    const customer_id = req.user?.id || null;
    
    // SECURITY FIX: Sanitize user inputs
    const {
      user_name,
      user_email,
      fb_link,
      flower_type,
      quantity,
      addons,
      message,
      rush,
    } = req.body;

    // Sanitize string inputs to prevent XSS
    const sanitizedUserName = sanitizeString(user_name, 200);
    const sanitizedFbLink = sanitizeString(fb_link, 500);
    const sanitizedMessage = sanitizeString(message, 2000);

    // reCAPTCHA removed: no client-side captcha required. Add server-side rate-limits/anti-abuse if needed.

    // Compute total using products/pricing stored in the DB (pricing is an array of rows per product).
  let totalFee = 0;
  // helpers to collect matched categories for rush fee calculation
  let matchedCategories = [];
  let singleMatchedCategory = null;
    try {
  const { data: products } = await supabase.from('products').select('id,name,pricing,addons,category');
      if (products && Array.isArray(products)) {
        // Helper to compute price for a single item
        // Normalize a code by removing non-alphanumeric chars and uppercasing
        const normalizeCode = s => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

        const computeFor = (itemFlower, itemQty) => {
          let itemTotal = 0;
          let found = null;
          const needle = normalizeCode(itemFlower);
          for (const p of products) {
            if (p.pricing && Array.isArray(p.pricing)) {
              const row = p.pricing.find(r => {
                const label = normalizeCode(r.label || r.set || '');
                // match exact normalized code or allow contains
                return label === needle || label.includes(needle) || needle.includes(label);
              });
              if (row) { found = { product: p, row }; break; }
            }
            const pname = normalizeCode(p.name || '');
            if (pname && (pname === needle || pname.includes(needle) || needle.includes(pname))) {
              found = { product: p, row: null };
              break;
            }
          }
          const qty = parseInt(itemQty) || 1;
          if (found && found.row && found.row.price != null) {
            itemTotal = Number(found.row.price) * qty;
          } else if (found && found.product && Array.isArray(found.product.pricing) && found.product.pricing.length) {
            const r = found.product.pricing.find(x => x.price != null);
            itemTotal = r ? Number(r.price) * qty : 0;
          }
          if (!itemTotal) {
            // Debug: when no match, log the normalized needle and a sample of product labels to aid diagnosis
            // Removed debug logging for production
          }
          return { itemTotal, matched: !!found, matchedProduct: found && found.product ? found.product.name : null, matchedRow: found && found.row ? (found.row.label || found.row.set) : null, matchedCategory: found && found.product ? found.product.category : null };
        };

        if (Array.isArray(req.body.items) && req.body.items.length) {
          // multiple item order
            // reuse the outer `matchedCategories` (do not redeclare) so it is available
            // later when applying rush fees
            matchedCategories = [];
            for (const it of req.body.items) {
              if (!it || !it.flower_type) continue;
              const info = computeFor(it.flower_type, it.quantity || 1);
              totalFee += info.itemTotal || 0;
              if (info.matchedCategory) matchedCategories.push({ category: info.matchedCategory, qty: parseInt(it.quantity) || 1 });
            }
          // Debug: show matched categories from products// if rush, we'll add category-specific rush fees below using matchedCategories
        } else {
          // single item fallback (backwards compatible)
          let found = null;
          for (const p of products) {
            if (Array.isArray(p.pricing)) {
              const row = p.pricing.find(r => {
                const label = String(r.label || '').trim();
                const set = String(r.set || '').trim();
                return label === flower_type || set === flower_type || label.includes(flower_type) || set.includes(flower_type);
              });
              if (row) { found = { product: p, row }; break; }
            }
            if (String(p.name || '').toUpperCase().includes(String(flower_type || '').toUpperCase())) {
              found = { product: p, row: null };
              break;
            }
          }
          const qty = parseInt(quantity) || 1;
          if (found && found.row && found.row.price != null) {
            totalFee = Number(found.row.price) * qty;
          } else if (found && found.product && Array.isArray(found.product.pricing) && found.product.pricing.length) {
            const r = found.product.pricing.find(x => x.price != null);
            totalFee = r ? Number(r.price) * qty : 0;
          }
          // record matched category for single-item orders
          singleMatchedCategory = found && found.product ? found.product.category : null;
        }

        // parse addon prices if present (attempt to extract numeric ₱ value from addon label)
        // Multiply addon prices by total quantity
        if (addons && Array.isArray(addons)) {
          const totalQuantity = parseInt(quantity) || 1;
          for (const a of addons) {
            if (!a) continue;
            const str = String(a);
            const m = str.match(/₱\s?([0-9,]+(?:\.\d+)?)/);
            if (m && m[1]) {
              const num = Number(m[1].replace(/,/g, ''));
              if (!Number.isNaN(num)) totalFee += num * totalQuantity;
            } else {
              const mm = str.match(/(\d+(?:,\d+)?)(?:\s*PHP|\s*₱)?$/);
              if (mm && mm[1]) {
                const num = Number(mm[1].replace(/,/g, ''));
                if (!Number.isNaN(num)) totalFee += num * totalQuantity;
              }
            }
          }
        }
      }
    } catch (err) {}

    // If rush is requested, add per-category rush fees (if categories define a rush_fee)
    try {
      const rushFlag = String(rush || '').toLowerCase() === 'yes' || String(rush || '').toLowerCase() === 'true' || rush === true;
      if (rushFlag) {
        // fetch categories and map by name, slug and id (case-insensitive) so product.category
        // which may store a slug or id will still match the category's rush_fee
        const { data: cats } = await supabase.from('categories').select('id,name,slug,rush_fee');
        const feeMap = {};
        (cats || []).forEach(c => {
          const fee = Number(c.rush_fee) || 0;
          const nameKey = String(c.name || '').trim().toLowerCase();
          const slugKey = String(c.slug || '').trim().toLowerCase();
          const idKey = c.id != null ? String(c.id).trim() : '';
          if (nameKey) feeMap[nameKey] = fee;
          if (slugKey) feeMap[slugKey] = fee;
          if (idKey) feeMap[idKey] = fee;
        });
        // apply fees for multi-item orders
        if (Array.isArray(req.body.items) && req.body.items.length) {
          // Debug: compute and log per-category fee additions
          let computedRush = 0;
          for (const mc of (matchedCategories || [])) {
            const key = String(mc.category || '').trim().toLowerCase();
            const fee = feeMap[key] || 0;
            if (fee) {
              const add = fee * (mc.qty || 1);
              computedRush += add;totalFee += add;
            } else {}
          }} else {
          // single item
          const key = String(singleMatchedCategory || '').trim().toLowerCase();
          const fee = feeMap[key] || 0;
          if (fee) {
            const add = fee * (parseInt(quantity) || 1);totalFee += add;
          } else {}
        }
      }
    } catch (feeErr) {}

    const orderId = generateOrderId();
    // Simple server-side sanitization to strip tags from user-provided text fields
    const stripTags = (s) => String(s || '').replace(/<[^>]*>?/gm, '').trim();

    const orderData = {
      order_id: orderId,
      customer_id: customer_id, // Link order to authenticated customer
      name: sanitizedUserName || stripTags(user_name),
      email: String(user_email).trim(),
      fb_link: sanitizedFbLink || stripTags(fb_link) || 'Not provided',
      flower_type,
      quantity: parseInt(quantity) || 1,
      addons: Array.isArray(addons) ? addons.map(a => stripTags(a)) : [],
      message: sanitizedMessage || stripTags(message) || 'Not provided',
      rush,
      total_fee: totalFee,
    };
    
    // Set status to Delivered for manual orders (from admin dashboard)
    const isManualOrder = req.body.manual_order === true || req.body.manual_order === 'true';
    if (req.body.status && isManualOrder) {
      orderData.status = sanitizeString(req.body.status, 50);
      console.log('Manual order - setting status to:', orderData.status);
    }
    
    // Prefer client's local ISO datetime when provided (reflects user's OS time exactly)
    try {
      if (req.body.created_at_local_iso) {
        // If tz offset provided, append it to create an ISO with offset so DB stores the exact local time
        const localIso = String(req.body.created_at_local_iso || '').trim();
        let offsetStr = '';
        if (typeof req.body.tz_offset_minutes !== 'undefined') {
          const tz = Number(req.body.tz_offset_minutes);
          if (!Number.isNaN(tz)) {
            // tz is minutes to add to local to get UTC (Date.getTimezoneOffset()), usually negative for UTC+ zones
            const totalMinutes = Math.abs(Math.floor(tz));
            const sign = tz <= 0 ? '+' : '-';
            const pad = (n) => String(n).padStart(2, '0');
            const h = Math.floor(totalMinutes / 60);
            const m = totalMinutes % 60;
            offsetStr = sign + pad(h) + ':' + pad(m);
          }
        }
        orderData.created_at = localIso + (offsetStr || '');
      } else if (req.body.created_at) {
        const cd = new Date(req.body.created_at);
        if (!isNaN(cd.getTime())) orderData.created_at = cd.toISOString();
        else orderData.created_at = new Date().toISOString();
      } else {
        orderData.created_at = new Date().toISOString();
      }
    } catch (e) { try { orderData.created_at = new Date().toISOString(); } catch (ee) {} }
    // Include optional phone and structured items when provided by the client
    if (req.body.phone) orderData.phone = String(req.body.phone).trim();
    if (req.body.customer_phone) orderData.customer_phone = String(req.body.customer_phone).trim();
    // Map legacy `customer_email` field into canonical `email` column to avoid DB schema mismatch
    if (req.body.customer_email) orderData.email = String(req.body.customer_email).trim();
    
    // Mobile push token handling removed (push notifications disabled project-wide)
    const expoPushToken = null;
    
    if (Array.isArray(req.body.items) && req.body.items.length) {
      // sanitize items: { flower_type, quantity, optional color }
      orderData.items = req.body.items.map(it => {
        const flower_type = String(it.flower_type || it.flower || '').trim();
        const quantity = parseInt(it.quantity || it.qty || 1) || 1;
        const item = { flower_type, quantity };
        if (it.color && (it.color.value || it.color.name)) {
          // sanitize color fields
          const colorName = String(it.color.name || '').replace(/<[^>]*>?/gm, '').trim();
          const colorValue = String(it.color.value || it.color.hex || it.color.color || '').trim();
          item.color = { name: colorName || null, value: colorValue || null };
        }
        return item;
      });
      // also keep backward-compatible summary fields
      orderData.flower_type = orderData.items.map(it => `${it.flower_type} x${it.quantity}`).join('; ');
      orderData.quantity = orderData.items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0) || 1;
    }

    // Only store canonical created_at (constructed from client local ISO+offset when provided).
    // Do not persist auxiliary client-local fields (created_at_local_iso, created_at_local, tz_offset_minutes) — keep DB minimal per request.
    const { data, error } = await supabase.from('orders').insert([orderData]).select();
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save order to database' });
    }

    console.log('Order inserted, returned data:', data && data[0] ? { order_id: data[0].order_id, status: data[0].status } : 'no data');

    // Save push token to push_subscriptions table for notifications
    // Always upsert the token (even if email/phone not provided) so we can find orders by token
    // (removed) previously saved expo push tokens here

    // If this is a manual order, update the status to Delivered immediately after insert
    console.log('Manual order check:', { manual_order: req.body.manual_order, isManualOrder, hasData: !!(data && data[0]) });
    
    if (isManualOrder && data && data[0]) {
      console.log('Attempting to update order status to Delivered...');
      try {
        const { data: updatedData, error: updateError } = await supabase
          .from('orders')
          .update({ status: 'Delivered' })
          .eq('order_id', data[0].order_id)
          .select();
        
        if (updateError) {
          console.error('Failed to update manual order status:', updateError);
        } else {
          console.log('Manual order status updated successfully:', updatedData);
          // Update the local data object so the response reflects the correct status
          if (updatedData && updatedData[0]) {
            data[0].status = updatedData[0].status;
          } else {
            data[0].status = 'Delivered';
          }
        }
      } catch (updateErr) {
        console.error('Error updating manual order status:', updateErr);
      }
    } else {
      console.log('Skipping status update - not a manual order or no data');
    }

    // Send order confirmation email (best-effort)
    try {
      const mail = templates.orderConfirmationTemplate(orderData);
      await mailer.sendMail({ to: user_email, subject: mail.subject, html: mail.html });
    } catch (mailErr) {
      console.error('Failed to send confirmation email:', mailErr);
    }

  // Post a minimal notification to Discord (avoid leaking customer email)
    try {
      const embed = {
        embeds: [{
          title: 'New Inquiry Received! 💐',
          color: 0xff69b4,
          fields: [
            { name: 'Order ID', value: orderId, inline: true },
            { name: 'Name', value: user_name, inline: true },
            { name: 'Facebook Link', value: fb_link || 'Not provided', inline: true },
            { name: 'Flower Type', value: flower_type, inline: true },
            { name: 'Quantity', value: quantity.toString(), inline: true },
            { name: 'Add-ons', value: addons?.length ? addons.join(', ') : 'None', inline: false },
            { name: 'Rush Order', value: rush, inline: true },
            { name: 'Total Fee (₱)', value: totalFee.toString(), inline: true },
          ],
        }],
      };

      if (process.env.DISCORD_WEBHOOK_URL) {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embed),
        });
      }
    } catch (discordErr) {}

    // Notify admins via Facebook Messenger (if configured)
    try {
      const messenger = require('../lib/messenger');
      // prefer the inserted row data if available
      const inserted = (data && Array.isArray(data) && data[0]) ? data[0] : orderData;
      const notifyResult = await messenger.notifyAdmins(inserted);
      if (!notifyResult.ok) {
        console.warn('Failed to notify admins via Messenger:', notifyResult.message || notifyResult.error);
      }
    } catch (mErr) {
      console.error('Messenger notification error:', mErr);
    }

    res.json({ message: 'Inquiry sent successfully!', orderId });
  } catch (error) {
    console.error('Inquiry error:', error);
    res.status(500).json({ error: 'Failed to process inquiry' });
  }
});

// Messenger webhook endpoints moved to `src/routes/messenger.js` to avoid duplication.
// This file previously contained webhook handlers at /messenger/webhook; the centralized handlers now live in the
// dedicated router so there's a single source of truth. See `src/routes/messenger.js` for verification and event handling.

router.get('/track/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const idRaw = String(orderId || '').trim();

    // Try exact match first
    let result = await supabase.from('orders').select('*').eq('order_id', idRaw).single();

    // If not found, try uppercase (some clients may enter lowercase while generated IDs are uppercase)
    if ((!result || result.error || !result.data) && idRaw) {
      try {
        result = await supabase.from('orders').select('*').eq('order_id', String(idRaw).toUpperCase()).single();
      } catch (e) {
        // ignore and continue to next fallback
      }
    }

    // Final fallback: case-insensitive lookup using ILIKE (exact value) to tolerate variations
    if ((!result || result.error || !result.data) && idRaw) {
      try {
        const fallback = await supabase.from('orders').select('*').ilike('order_id', idRaw).limit(1);
        if (fallback && fallback.data && fallback.data.length) {
          result = { data: fallback.data[0], error: null };
        }
      } catch (e) {
        // ignore
      }
    }

    const data = result && result.data ? result.data : null;
    if (!data) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderId: data.order_id,
      name: data.name,
      flower_type: data.flower_type,
      quantity: data.quantity,
      addons: data.addons,
      total_fee: data.total_fee == null ? 0 : data.total_fee,
      status: data.status,
      // Return only the stored created_at field (user requested: save just the date/time)
      created_at: data.created_at,
      items: data.items || null,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// Get orders for authenticated customer
router.get('/orders', authenticateCustomer, async (req, res) => {
  try {
    const customerId = req.user.id;
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching customer orders:', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Track order by tracking code (authenticated)
router.get('/orders/track/:trackingCode', authenticateCustomer, async (req, res) => {
  try {
    const { trackingCode } = req.params;
    const customerEmail = req.user.email;
    
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tracking_code', trackingCode.toUpperCase())
      .eq('email', customerEmail)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      id: data.id,
      tracking_code: data.tracking_code,
      flower_type: data.flower_type,
      quantity: data.quantity,
      total_price: data.total_price,
      status: data.status,
      created_at: data.created_at,
      delivery_address: data.delivery_address,
      phone: data.phone
    });
  } catch (error) {
    console.error('Error tracking order:', error);
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// Get orders by email (for My Orders screen)
router.get('/orders/by-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      // Only query the canonical `email` column. Some older clients sent `customer_email` but
      // the DB schema uses `email`, and referencing a non-existent column causes SQL errors.
      .or(`email.eq.${email}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders by email:', error);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get orders by expo push token (for devices that didn't provide email)
router.get('/orders/by-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token required' });

    // Find matching push_subscriptions row by endpoint token
    const { data: tokens, error: tokenErr } = await supabase
      .from('push_subscriptions')
      .select('phone,email,endpoint,subscription')
      .eq('endpoint', token)
      .limit(1);

    if (tokenErr) {
      console.error('Error fetching push token record:', tokenErr);
      return res.status(500).json({ error: 'Failed to fetch token record' });
    }

    if (!tokens || tokens.length === 0) {
      // No mapping found - return empty array
      return res.json([]);
    }

    const rec = tokens[0] || {};
    const phone = rec.phone || '';
    const email = rec.email || '';

    // Query orders by phone or email associated with this token
    const orFilterParts = [];
    if (email) orFilterParts.push(`email.eq.${email}`);
    if (phone) orFilterParts.push(`phone.eq.${phone}`);

    if (!orFilterParts.length) {
      // No phone/email associated with this token - nothing to return
      return res.json([]);
    }

    const orClause = orFilterParts.join(',');
    let data = null;
    try {
      const result = await supabase.from('orders').select('*').or(orClause).order('created_at', { ascending: false });
      data = result.data;
      if (result.error) {
        console.error('Supabase error fetching orders by token:', result.error);
        return res.status(500).json({ error: 'Failed to fetch orders' });
      }
    } catch (qErr) {
      console.error('Unexpected error querying orders by token:', qErr && qErr.message ? qErr.message : qErr);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('orders/by-token error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Public endpoint: recompute total for an orderId using current products/pricing logic
// This is used by the order success page to show customers their order total
router.get('/recompute-total/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });

  const { data: products } = await supabase.from('products').select('id,name,pricing,addons,category');
    if (!products) return res.status(500).json({ error: 'Failed to load products' });

    const normalizeCode = s => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

    const computeForDebug = (itemFlower, itemQty) => {
      const needle = normalizeCode(itemFlower);
      let found = null;
      for (const p of products) {
        if (p.pricing && Array.isArray(p.pricing)) {
          const row = p.pricing.find(r => {
            const label = normalizeCode(r.label || r.set || '');
            return label === needle || label.includes(needle) || needle.includes(label);
          });
          if (row) { found = { product: p, row }; break; }
        }
        const pname = normalizeCode(p.name || '');
        if (pname && (pname === needle || pname.includes(needle) || needle.includes(pname))) {
          found = { product: p, row: null };
          break;
        }
      }
      const qty = parseInt(itemQty) || 1;
      let itemTotal = 0;
      let matchedRowLabel = null;
      let matchedProductName = null;
      if (found && found.row && found.row.price != null) {
        itemTotal = Number(found.row.price) * qty;
        matchedRowLabel = found.row.label || found.row.set || null;
        matchedProductName = found.product.name || null;
      } else if (found && found.product && Array.isArray(found.product.pricing) && found.product.pricing.length) {
        const r = found.product.pricing.find(x => x.price != null);
        itemTotal = r ? Number(r.price) * qty : 0;
        matchedRowLabel = r ? (r.label || r.set || null) : null;
        matchedProductName = found.product.name || null;
      }
      return { itemFlower, qty, itemTotal, matchedProductName, matchedRowLabel };
    };

    const details = [];
    let recomputed = 0;
    const itemsWithCategory = [];
    if (Array.isArray(order.items) && order.items.length) {
      for (const it of order.items) {
        const d = computeForDebug(it.flower_type || it.flower || '', it.quantity || it.qty || 1);
        recomputed += d.itemTotal || 0;
        details.push(d);
        // Track category for rush fee calculation
        if (d.matchedProductName) {
          const prod = products.find(p => p.name === d.matchedProductName);
          if (prod && prod.category) {
            itemsWithCategory.push({ category: prod.category, quantity: it.quantity || it.qty || 1 });
          }
        }
      }
    } else {
      // attempt to parse summary flower_type like "FWGK1 x1; FWGK2 x1"
      const parts = String(order.flower_type || '').split(';').map(s => s.trim()).filter(Boolean);
      if (parts.length) {
        for (const p of parts) {
          const m = p.match(/(.+?)\s*[x×]\s*(\d+)$/i);
          if (m) {
            const d = computeForDebug(m[1].trim(), Number(m[2]));
            recomputed += d.itemTotal || 0;
            details.push(d);
            // Track category for rush fee calculation
            if (d.matchedProductName) {
              const prod = products.find(pr => pr.name === d.matchedProductName);
              if (prod && prod.category) {
                itemsWithCategory.push({ category: prod.category, quantity: Number(m[2]) });
              }
            }
          } else {
            const d = computeForDebug(p, 1);
            recomputed += d.itemTotal || 0;
            details.push(d);
            // Track category for rush fee calculation
            if (d.matchedProductName) {
              const prod = products.find(pr => pr.name === d.matchedProductName);
              if (prod && prod.category) {
                itemsWithCategory.push({ category: prod.category, quantity: 1 });
              }
            }
          }
        }
      }
    }

    // parse addons as before
    if (order.addons && Array.isArray(order.addons)) {
      for (const a of order.addons) {
        if (!a) continue;
        const str = String(a);
        const m = str.match(/₱\s?([0-9,]+(?:\.\d+)?)/);
        if (m && m[1]) {
          recomputed += Number(m[1].replace(/,/g, ''));
        } else {
          const mm = str.match(/(\d+(?:,\d+)?)(?:\s*PHP|\s*₱)?$/);
          if (mm && mm[1]) recomputed += Number(mm[1].replace(/,/g, ''));
        }
      }
    }

    // Apply rush fees if order is marked as rush
    try {
      const rushFlag = String(order.rush || '').toLowerCase() === 'yes' || String(order.rush || '').toLowerCase() === 'true' || order.rush === true;
      if (rushFlag && itemsWithCategory.length > 0) {
        const { data: cats } = await supabase.from('categories').select('id,name,slug,rush_fee');
        const feeMap = {};
        (cats || []).forEach(c => {
          const fee = Number(c.rush_fee) || 0;
          const nameKey = String(c.name || '').trim().toLowerCase();
          const slugKey = String(c.slug || '').trim().toLowerCase();
          const idKey = c.id != null ? String(c.id).trim() : '';
          if (nameKey) feeMap[nameKey] = fee;
          if (slugKey) feeMap[slugKey] = fee;
          if (idKey) feeMap[idKey] = fee;
        });
        // apply fees
        for (const it of itemsWithCategory) {
          const key = String(it.category || '').trim().toLowerCase();
          const fee = feeMap[key] || 0;
          if (fee) recomputed += fee * (parseInt(it.quantity) || 1);
        }
      }
    } catch (rfErr) {}

    return res.json({ orderId: order.order_id, original_total_fee: order.total_fee, recomputed_total: recomputed, details });
  } catch (err) {
    console.error('recompute-total error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to recompute total' });
  }
});

// ADMIN: recompute and update an order's items and total_fee in the DB
router.post('/recompute-total/:orderId/update', async (req, res) => {
  const adminToken = process.env.ADMIN_SETUP_TOKEN || '';
  const provided = (req.query.token || req.body.token || '');
  if (adminToken && adminToken !== provided) {
    return res.status(403).json({ error: 'Invalid admin token' });
  }
  try {
    const { orderId } = req.params;
    const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });

  const { data: products } = await supabase.from('products').select('id,name,pricing,addons,category');
    if (!products) return res.status(500).json({ error: 'Failed to load products' });

    const normalizeCode = s => String(s || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const computeForDebug = (itemFlower, itemQty) => {
      const needle = normalizeCode(itemFlower);
      let found = null;
      for (const p of products) {
        if (p.pricing && Array.isArray(p.pricing)) {
          const row = p.pricing.find(r => {
            const label = normalizeCode(r.label || r.set || '');
            return label === needle || label.includes(needle) || needle.includes(label);
          });
          if (row) { found = { product: p, row }; break; }
        }
        const pname = normalizeCode(p.name || '');
        if (pname && (pname === needle || pname.includes(needle) || needle.includes(pname))) {
          found = { product: p, row: null };
          break;
        }
      }
      const qty = parseInt(itemQty) || 1;
      let itemTotal = 0;
      let matchedRowLabel = null;
      let matchedProductName = null;
      let matchedProductCategory = null;
      if (found && found.row && found.row.price != null) {
        itemTotal = Number(found.row.price) * qty;
        matchedRowLabel = found.row.label || found.row.set || null;
        matchedProductName = found.product.name || null;
        matchedProductCategory = found.product.category || null;
      } else if (found && found.product && Array.isArray(found.product.pricing) && found.product.pricing.length) {
        const r = found.product.pricing.find(x => x.price != null);
        itemTotal = r ? Number(r.price) * qty : 0;
        matchedRowLabel = r ? (r.label || r.set || null) : null;
        matchedProductName = found.product.name || null;
        matchedProductCategory = found.product.category || null;
      }
      return { flower_type: itemFlower, qty, itemTotal, matchedProductName, matchedRowLabel, matchedProductCategory };
    };

    const details = [];
    let recomputed = 0;
    const itemsArr = [];
    if (Array.isArray(order.items) && order.items.length) {
      for (const it of order.items) {
        const d = computeForDebug(it.flower_type || it.flower || '', it.quantity || it.qty || 1);
        recomputed += d.itemTotal || 0;
        details.push(d);
        itemsArr.push({ flower_type: d.flower_type, quantity: d.qty, category: d.matchedProductCategory });
      }
    } else {
      const parts = String(order.flower_type || '').split(';').map(s => s.trim()).filter(Boolean);
      if (parts.length) {
        for (const p of parts) {
          const m = p.match(/(.+?)\s*[x×]\s*(\d+)$/i);
          if (m) {
            const d = computeForDebug(m[1].trim(), Number(m[2]));
            recomputed += d.itemTotal || 0;
            details.push(d);
            itemsArr.push({ flower_type: d.flower_type, quantity: d.qty, category: d.matchedProductCategory });
          } else {
            const d = computeForDebug(p, 1);
            recomputed += d.itemTotal || 0;
            details.push(d);
            itemsArr.push({ flower_type: d.flower_type, quantity: d.qty, category: d.matchedProductCategory });
          }
        }
      }
    }

    if (order.addons && Array.isArray(order.addons)) {
      for (const a of order.addons) {
        if (!a) continue;
        const str = String(a);
        const m = str.match(/₱\s?([0-9,]+(?:\.\d+)?)/);
        if (m && m[1]) {
          recomputed += Number(m[1].replace(/,/g, ''));
        } else {
          const mm = str.match(/(\d+(?:,\d+)?)(?:\s*PHP|\s*₱)?$/);
          if (mm && mm[1]) recomputed += Number(mm[1].replace(/,/g, ''));
        }
      }
    }

    // If the order was a rush order, attempt to apply per-category rush fees
    try {
      const rushFlag = String(order.rush || '').toLowerCase() === 'yes' || String(order.rush || '').toLowerCase() === 'true' || order.rush === true;
      if (rushFlag) {
        const { data: cats } = await supabase.from('categories').select('id,name,slug,rush_fee');
        const feeMap = {};
        (cats || []).forEach(c => {
          const fee = Number(c.rush_fee) || 0;
          const nameKey = String(c.name || '').trim().toLowerCase();
          const slugKey = String(c.slug || '').trim().toLowerCase();
          const idKey = c.id != null ? String(c.id).trim() : '';
          if (nameKey) feeMap[nameKey] = fee;
          if (slugKey) feeMap[slugKey] = fee;
          if (idKey) feeMap[idKey] = fee;
        });
        // apply fees
        for (const it of itemsArr) {
          const key = String(it.category || '').trim().toLowerCase();
          const fee = feeMap[key] || 0;
          if (fee) recomputed += fee * (parseInt(it.quantity) || 1);
        }
      }
    } catch (rfErr) {}

    // update the order record with recomputed values (safe, minimal fields)
    const updates = { total_fee: recomputed };
    if (itemsArr.length) updates.items = itemsArr;
    const { data: updated, error: updateErr } = await supabase.from('orders').update(updates).eq('order_id', orderId).select();
    if (updateErr) {
      console.error('Failed updating order during recompute:', updateErr);
      return res.status(500).json({ error: 'Failed to update order' });
    }

    return res.json({ ok: true, orderId, recomputed_total: recomputed, details, updated: (updated && updated[0]) || null });
  } catch (err) {
    console.error('recompute-update error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to recompute and update order' });
  }
});

// Public products list for the public site (no auth)
// Cache for 10 minutes to reduce database load
router.get('/products', cacheMiddleware(600), async (req, res) => {
  try {
    console.log('Fetching products from Supabase...');
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_url,category,pricing,addons,colors')
      .order('id', { ascending: true });
    
    if (error) {
      console.error('Supabase error fetching products:', error);
      return res.status(500).json({ error: 'Failed to fetch products', details: error.message });
    }
    
    console.log(`Products fetched successfully: ${data?.length || 0} items`);
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});

// Public single product by ID (no auth)
// Cache for 10 minutes
router.get('/products/:id', cacheMiddleware(600), async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching product with ID:', id);
    
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_url,category,pricing,addons,colors')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Supabase error fetching product:', error);
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(data);
  } catch (err) {
    console.error('Unexpected error fetching product:', err);
    res.status(500).json({ error: 'Failed to fetch product', details: err.message });
  }
});

// Public categories list (no auth)
// Include rush_fee so the public site can show/apply rush fees per category
// Cache for 10 minutes
router.get('/categories', cacheMiddleware(600), async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('id,name,slug,rush_fee').order('name', { ascending: true });
    if (error) {
      console.error('Error fetching categories:', error);
      return res.status(500).json({ error: 'Failed to fetch categories' });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Reviews endpoints (public)
// GET /reviews - list recent reviews
// Cache for 5 minutes (reviews change less frequently)
router.get('/reviews', cacheMiddleware(300), async (req, res) => {
  try {
    console.log('Fetching reviews from Supabase...');
    const { data, error } = await supabase
      .from('reviews')
      .select('id,order_id,name,stars,message,image_url,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.error('Supabase error fetching reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews', details: error.message });
    }
    
    console.log(`Reviews fetched successfully: ${data?.length || 0} items`);
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews', details: err.message });
  }
});

// POST /reviews - create a review after validating order id
// Accept JSON or multipart/form-data with an optional image file (field name 'image')
router.post('/reviews', upload.single('image'), sanitizeBody, async (req, res) => {
  try {
    // support both JSON body and multipart form body
    const body = req.body || {};
    const { orderId, stars, message } = body || {};
    if (!orderId || !stars || !message) {
      return res.status(400).json({ error: 'orderId, stars and message are required' });
    }

    // validate order exists and get customer name and status
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('order_id,name,status')
      .eq('order_id', String(orderId))
      .single();

    if (orderErr || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow reviews for delivered orders
    if (String(order.status || '').toLowerCase() !== 'delivered') {
      return res.status(400).json({ error: 'Reviews can only be submitted for orders with status "Delivered"' });
    }

    // Prevent duplicate reviews per order_id
    const { data: existing, error: existErr } = await supabase.from('reviews').select('id').eq('order_id', String(orderId)).limit(1);
    if (existErr) {
      console.error('Failed checking existing review:', existErr);
      // continue to attempt insert (don't leak too much info)
    }
    if (existing && existing.length) {
      return res.status(409).json({ error: 'Review for this order already exists' });
    }

    const review = {
      order_id: String(orderId),
      name: String(order.name || ''),
      stars: Math.max(1, Math.min(5, Number(stars) || 0)),
      message: String(message).replace(/<[^>]*>?/gm, ''),
    };

    // SECURITY FIX: Validate and upload image with proper checks
    if (req.file && req.file.buffer) {
      try {
        // Validate file type
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!req.file.mimetype || !allowedMimeTypes.includes(req.file.mimetype.toLowerCase())) {
          return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
        }

        // Validate file size (already limited by multer, but double-check)
        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }

        const supabase = require('../config/supabase');
        const bucket = process.env.SUPABASE_REVIEWS_BUCKET || 'reviews';
        // Sanitize filename to prevent path traversal
        const sanitizedOriginalName = String(req.file.originalname || 'img').replace(/[^a-z0-9.\-]/gi, '_').substring(0, 100);
        const filename = `${String(orderId)}_${Date.now()}_${sanitizedOriginalName}`;
        const path = `${String(orderId)}/${filename}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage.from(bucket).upload(path, req.file.buffer, { contentType: req.file.mimetype });
        if (uploadErr) {} else {
          // get public URL
          try {
            const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(path);
            if (urlData && urlData.publicUrl) review.image_url = urlData.publicUrl;
          } catch (uerr) {}
        }
      } catch (err) {}
    }

    // Attempt insert including image_url if set; if the DB doesn't have that column, retry without it
    let insertPayload = [review];
    let result = await supabase.from('reviews').insert(insertPayload).select();
    if (result.error && String(result.error.message || '').toLowerCase().includes('column') && review.image_url) {
      // likely image_url column missing; retry without image_url
      delete review.image_url;
      insertPayload = [review];
      result = await supabase.from('reviews').insert(insertPayload).select();
    }

    if (result.error) {
      console.error('Failed to insert review:', result.error);
      return res.status(500).json({ error: 'Failed to save review' });
    }
    res.json((result.data && result.data[0]) || { message: 'Review saved' });
  } catch (err) {
    console.error('Unexpected error saving review:', err);
    res.status(500).json({ error: 'Failed to save review' });
  }
});

// Status page endpoints - Automatic monitoring
router.get('/status/current', async (req, res) => {
  try {
    const incidents = [];
    const now = new Date();
    
    // Check website status (self-check)
    let websiteStatus = 'operational';
    
    // Check database connectivity with detailed testing
    let databaseStatus = 'operational';
    let databaseResponseTime = 0;
    try {
      const dbStart = Date.now();
      const { error: dbError } = await supabase.from('products').select('id').limit(1);
      databaseResponseTime = Date.now() - dbStart;
      
      if (dbError) {
        databaseStatus = 'outage';
        incidents.push({
          title: 'Database Connection Error',
          description: `Unable to connect to database: ${dbError.message}`,
          severity: 'critical',
          status: 'ongoing',
          affected_systems: ['database', 'website', 'mobile_app'],
          created_at: now.toISOString()
        });
      } else if (databaseResponseTime > 2000) {
        databaseStatus = 'degraded';
        incidents.push({
          title: 'Database Performance Degradation',
          description: `Database queries are slower than normal (${databaseResponseTime}ms). Users may experience delays.`,
          severity: 'major',
          status: 'ongoing',
          affected_systems: ['database'],
          created_at: now.toISOString()
        });
      }
    } catch (err) {
      databaseStatus = 'outage';
      incidents.push({
        title: 'Database System Outage',
        description: 'Critical error connecting to database. Service temporarily unavailable.',
        severity: 'critical',
        status: 'ongoing',
        affected_systems: ['database', 'website', 'mobile_app'],
        created_at: now.toISOString()
      });
    }

    // Check mobile app status (API health and recent activity)
    let mobileAppStatus = 'operational';
    try {
      const apiStart = Date.now();
      const { data: recentOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      const apiResponseTime = Date.now() - apiStart;
      
      if (ordersError) {
        mobileAppStatus = 'degraded';
        incidents.push({
          title: 'Mobile App API Issues',
          description: 'Mobile app may have difficulty loading data.',
          severity: 'major',
          status: 'ongoing',
          affected_systems: ['mobile_app'],
          created_at: now.toISOString()
        });
      } else if (apiResponseTime > 3000) {
        mobileAppStatus = 'degraded';
        incidents.push({
          title: 'Mobile App Slow Response',
          description: `API response time is degraded (${apiResponseTime}ms). App may be slow.`,
          severity: 'minor',
          status: 'ongoing',
          affected_systems: ['mobile_app'],
          created_at: now.toISOString()
        });
      }
    } catch (err) {
      mobileAppStatus = 'degraded';
      incidents.push({
        title: 'Mobile App Service Degraded',
        description: 'Mobile app experiencing connectivity issues.',
        severity: 'major',
        status: 'ongoing',
        affected_systems: ['mobile_app'],
        created_at: now.toISOString()
      });
    }

    // Determine overall status
    let overallStatus = 'operational';
    const statuses = [websiteStatus, databaseStatus, mobileAppStatus];
    
    if (statuses.includes('outage')) {
      overallStatus = 'outage';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    // Add performance metrics
    const metrics = {
      database_response_time: databaseResponseTime,
      checks_performed: 5,
      timestamp: now.toISOString()
    };

    res.json({
      status: {
        overall_status: overallStatus,
        website_status: websiteStatus,
        mobile_app_status: mobileAppStatus,
        database_status: databaseStatus,
        message: overallStatus === 'operational' 
          ? 'All systems are running smoothly' 
          : 'Some services are experiencing issues',
        last_check: now.toISOString()
      },
      activeIncidents: incidents,
      metrics,
      lastUpdated: now.toISOString()
    });
  } catch (err) {
    console.error('Error fetching status:', err);
    res.json({
      status: {
        overall_status: 'outage',
        website_status: 'outage',
        mobile_app_status: 'outage',
        database_status: 'outage',
        message: 'Critical system error - monitoring unavailable'
      },
      activeIncidents: [{
        title: 'Critical System Error',
        description: 'Status monitoring system is experiencing issues. Our team has been notified.',
        severity: 'critical',
        status: 'ongoing',
        affected_systems: ['website', 'mobile_app', 'database'],
        created_at: new Date().toISOString()
      }],
      metrics: {
        checks_performed: 0,
        timestamp: new Date().toISOString()
      },
      lastUpdated: new Date().toISOString()
    });
  }
});

// Get historical status data (last 30 days uptime)
router.get('/status/history', async (req, res) => {
  try {
    // Generate last 30 days of uptime data based on system checks
    const history = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // In a real implementation, you'd query historical data
      // For now, we'll show mostly operational with occasional issues
      history.push({
        date: date.toISOString().split('T')[0],
        status: 'operational', // Default to operational
        uptime_percentage: 99.9
      });
    }

    res.json({
      history,
      average_uptime: 99.9,
      period_days: 30
    });
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Chat endpoints for order-based messaging
// Send a chat message for an order
router.post('/chat/send', async (req, res) => {
  try {
    const { order_id, message, sender_type } = req.body;
    
    if (!order_id || !message || !sender_type) {
      return res.status(400).json({ error: 'Order ID, message, and sender type are required' });
    }
    
    if (!['customer', 'admin'].includes(sender_type)) {
      return res.status(400).json({ error: 'Invalid sender type' });
    }
    
    // Verify order exists and is not delivered
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, status')
      .eq('order_id', order_id.toUpperCase())
      .single();
    
    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.status === 'Delivered') {
      return res.status(400).json({ error: 'Cannot send messages for delivered orders' });
    }
    
    // Sanitize message
    const sanitizedMessage = sanitizeString(message, 1000);
    
    // Insert message
    const { data: chatData, error: chatError } = await supabase
      .from('order_chats')
      .insert([{
        order_id: order_id.toUpperCase(),
        sender_type,
        message: sanitizedMessage,
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (chatError) {
      console.error('Error sending chat message:', chatError);
      return res.status(500).json({ error: 'Failed to send message' });
    }
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      data: chatData[0]
    });
  } catch (error) {
    console.error('Chat send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get chat messages for an order
router.get('/chat/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId.toUpperCase();
    
    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_id, status')
      .eq('order_id', orderId)
      .single();
    
    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Get all messages for this order
    const { data: messages, error: messagesError } = await supabase
      .from('order_chats')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      console.error('Error fetching chat messages:', messagesError);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
    
    res.json({ 
      order_id: orderId,
      order_status: order.status,
      messages: messages || []
    });
  } catch (error) {
    console.error('Chat fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Push subscription endpoints removed — push notifications disabled project-wide.

// Customer Chat Endpoints (authenticated customers only)
// Get all messages for authenticated customer
router.get('/customer-chat', authenticateCustomer, async (req, res) => {
  try {
    const customerId = req.user.id;
    console.log('Getting chat messages for customer:', customerId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Hard-delete messages older than 30 days to keep the inbox clean
    await supabase
      .from('customer_messages')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());
    
    // Get all messages from customer_messages table (general messaging)
    const { data: messages, error: messagesError } = await supabase
      .from('customer_messages')
      .select(`
        id,
        customer_id,
        order_id,
        product_id,
        sender_type,
        message,
        image_url,
        created_at
      `)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    
    if (messagesError) {
      // If the table is missing optional columns (e.g., deleted_for), avoid breaking chat
      if (messagesError.code === '42703') {
        console.warn('Column missing in customer_messages (likely deleted_for). Returning empty list.');
        return res.json({ success: true, messages: [] });
      }

      console.error('Error fetching messages:', messagesError);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
    
    console.log('Messages found:', messages ? messages.length : 0);
    
    res.json({ 
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Customer chat error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message as authenticated customer (supports text, images, and product inquiries)
router.post('/customer-chat/send', authenticateCustomer, upload.single('image'), async (req, res) => {
  try {
    const customerId = req.user.id;
    const { message, product_id, order_id } = req.body;
    
    console.log('Customer sending message:', { customerId, message: message ? 'yes' : 'no', product_id, order_id, hasImage: !!req.file });
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Sanitize message
    const sanitizedMessage = sanitizeString(message, 1000);
    
    // Prepare message data
    const messageData = {
      customer_id: customerId,
      sender_type: 'customer',
      message: sanitizedMessage,
      created_at: new Date().toISOString()
    };
    
    // Add optional product_id for product inquiries
    if (product_id) {
      messageData.product_id = parseInt(product_id);
    }
    
    // Add optional order_id if related to an order
    if (order_id) {
      messageData.order_id = order_id;
    }
    
    // Handle image upload if present
    if (req.file && req.file.buffer) {
      try {
        // Validate file type
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!req.file.mimetype || !allowedMimeTypes.includes(req.file.mimetype.toLowerCase())) {
          return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
        }

        // Validate file size (5MB limit)
        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }

        const bucket = process.env.SUPABASE_CHAT_BUCKET || 'chat-images';
        // Sanitize filename
        const sanitizedOriginalName = String(req.file.originalname || 'img').replace(/[^a-z0-9.\-]/gi, '_').substring(0, 100);
        const filename = `${customerId}_${Date.now()}_${sanitizedOriginalName}`;
        const path = `customer-${customerId}/${filename}`;
        
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, req.file.buffer, { contentType: req.file.mimetype });
        
        if (uploadErr) {
          console.error('Error uploading image:', uploadErr);
        } else {
          // Get public URL
          try {
            const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(path);
            if (urlData && urlData.publicUrl) {
              messageData.image_url = urlData.publicUrl;
            }
          } catch (urlErr) {
            console.error('Error getting public URL:', urlErr);
          }
        }
      } catch (err) {
        console.error('Image upload error:', err);
      }
    }
    
    // Insert message into customer_messages table
    const { data: chatData, error: chatError } = await supabase
      .from('customer_messages')
      .insert([messageData])
      .select();
    
    if (chatError) {
      console.error('Error sending customer chat message:', chatError);
      return res.status(500).json({ error: 'Failed to send message' });
    }
    
    console.log('Message sent successfully:', chatData);
    // Fire-and-forget: notify all admins via push
    try {
      const { data: adminTokens } = await supabase
        .from('push_subscriptions')
        .select('subscription,endpoint')
        .eq('user_type', 'admin')
        .not('subscription', 'is', null);

      if (adminTokens && adminTokens.length) {
        const messages = adminTokens
          .map(t => {
            const sub = t && t.subscription ? t.subscription : (t && t.endpoint ? { endpoint: t.endpoint } : null);
            return sub ? ({ subscription: sub, payload: { title: 'New customer message', body: sanitizedMessage, data: { type: 'customer_message', customer_id: customerId } } }) : null;
          })
          .filter(Boolean);
        if (messages.length) {
          try { await push.sendBatchWebPush(messages); } catch (pe) { console.warn('Failed sending admin push notifications:', pe); }
        }
      }
    } catch (pe) { console.warn('Admin push notify error:', pe); }

    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      data: chatData[0]
    });
  } catch (error) {
    console.error('Customer chat send error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete message endpoint
router.delete('/customer-chat/:id/delete', authenticateCustomer, async (req, res) => {
  try {
    const messageId = req.params.id;
    const customerId = req.user.id;
    const { deleteType } = req.body; // 'me' or 'everyone'
    
    // Get the message to check ownership
    const { data: message, error: fetchError } = await supabase
      .from('customer_messages')
      .select('*')
      .eq('id', messageId)
      .single();
    
    if (fetchError || !message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender
    const isSender = message.customer_id === customerId && message.sender_type === 'customer';
    
    if (deleteType === 'everyone') {
      // Only sender can delete for everyone
      if (!isSender) {
        return res.status(403).json({ error: 'You can only delete your own messages for everyone' });
      }
      
      // Hard delete for everyone
      const { error: deleteError } = await supabase
        .from('customer_messages')
        .delete()
        .eq('id', messageId);
      
      if (deleteError) throw deleteError;
    } else {
      // For "delete for me", we'll just hard delete since we don't have deleted_for column
      // This means it will be deleted for everyone, but we can add the column later
      // For now, let's not support "delete for me" - only "delete for everyone"
      return res.status(400).json({ error: 'Delete for me is not currently supported. Please use delete for everyone.' });
    }
    
    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Admin/Seller endpoints for customer messages
// Get all customer conversations (for admin dashboard)
router.get('/admin/customer-conversations', async (req, res) => {
  try {
    // Get all customers who have sent messages
    const { data: conversations, error } = await supabase
      .from('customer_messages')
      .select(`
        customer_id,
        customers!inner (id, name, email),
        created_at
      `)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching conversations:', error);
      return res.status(500).json({ error: 'Failed to load conversations' });
    }
    
    // Group by customer and get latest message
    const customerMap = new Map();
    
    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        const customerId = conv.customer_id;
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer_id: customerId,
            name: conv.customers?.name || 'Unknown',
            email: conv.customers?.email || '',
            last_message_at: conv.created_at
          });
        }
      }
    }
    
    const result = Array.from(customerMap.values());
    
    res.json({
      success: true,
      conversations: result
    });
  } catch (error) {
    console.error('Admin conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Get messages for a specific customer (for admin)
router.get('/admin/customer-messages/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Get all messages for this customer
    const { data: messages, error } = await supabase
      .from('customer_messages')
      .select(`
        id,
        customer_id,
        order_id,
        product_id,
        sender_type,
        message,
        image_url,
        created_at,
        products:product_id (id, name, image_url),
        customers!inner (id, name, email)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching customer messages:', error);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
    
    res.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Admin customer messages error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message as seller (admin) to customer
router.post('/admin/customer-messages/send', upload.single('image'), async (req, res) => {
  try {
    const { customer_id, message, product_id, order_id } = req.body;
    
    if (!customer_id || !message) {
      return res.status(400).json({ error: 'Customer ID and message are required' });
    }
    
    // Sanitize message
    const sanitizedMessage = sanitizeString(message, 1000);
    
    // Prepare message data
    const messageData = {
      customer_id: customer_id,
      sender_type: 'seller',
      message: sanitizedMessage,
      created_at: new Date().toISOString()
    };
    
    // Add optional references
    if (product_id) {
      messageData.product_id = parseInt(product_id);
    }
    
    if (order_id) {
      messageData.order_id = order_id;
    }
    
    // Handle image upload if present
    if (req.file && req.file.buffer) {
      try {
        // Validate file type
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!req.file.mimetype || !allowedMimeTypes.includes(req.file.mimetype.toLowerCase())) {
          return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
        }

        // Validate file size (5MB limit)
        if (req.file.size > 5 * 1024 * 1024) {
          return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }

        const bucket = process.env.SUPABASE_CHAT_BUCKET || 'chat-images';
        // Sanitize filename
        const sanitizedOriginalName = String(req.file.originalname || 'img').replace(/[^a-z0-9.\-]/gi, '_').substring(0, 100);
        const filename = `seller_${Date.now()}_${sanitizedOriginalName}`;
        const path = `seller/${filename}`;
        
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, req.file.buffer, { contentType: req.file.mimetype });
        
        if (uploadErr) {
          console.error('Error uploading image:', uploadErr);
        } else {
          // Get public URL
          try {
            const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(path);
            if (urlData && urlData.publicUrl) {
              messageData.image_url = urlData.publicUrl;
            }
          } catch (urlErr) {
            console.error('Error getting public URL:', urlErr);
          }
        }
      } catch (err) {
        console.error('Image upload error:', err);
      }
    }
    
    // Insert message
    const { data: chatData, error: chatError } = await supabase
      .from('customer_messages')
      .insert([messageData])
      .select();
    
    if (chatError) {
      console.error('Error sending seller message:', chatError);
      return res.status(500).json({ error: 'Failed to send message' });
    }
    // Notify the customer via push (if they have a registered token)
    try {
      const { data: tokens } = await supabase
        .from('push_subscriptions')
        .select('subscription,endpoint')
        .eq('user_id', customer_id)
        .eq('user_type', 'customer')
        .not('subscription', 'is', null)
        .limit(50);

      if (tokens && tokens.length) {
        const messages = tokens
          .map(t => {
            const sub = t && t.subscription ? t.subscription : (t && t.endpoint ? { endpoint: t.endpoint } : null);
            return sub ? ({ subscription: sub, payload: { title: 'Message from seller', body: sanitizedMessage, data: { type: 'seller_message', customer_id } } }) : null;
          })
          .filter(Boolean);
        if (messages.length) {
          try { await push.sendBatchWebPush(messages); } catch (pe) { console.warn('Failed sending customer push notifications:', pe); }
        }
      }
    } catch (pe) { console.warn('Customer push notify error:', pe); }

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: chatData[0]
    });
  } catch (error) {
    console.error('Admin send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

  // Register or update an Expo push token for a user (customer or admin)
  // Public endpoint to expose VAPID public key for web push subscriptions
  router.get('/push/public-key', async (req, res) => {
    try {
      const key = process.env.VAPID_PUBLIC_KEY || '';
      if (!key) return res.status(404).json({ error: 'VAPID public key not configured' });
      res.json({ publicKey: key });
    } catch (err) {
      console.error('Failed to get VAPID public key:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Debug: indicate this module's push handlers are loaded
  console.log('Push register/unregister handlers loaded (using push_subscriptions table)');

  router.post('/push/register', authenticateCustomerOrAdmin, async (req, res) => {
    try {
      // Accept either a legacy `expo_push_token` (string) or a `subscription` object
      const { expo_push_token, subscription, phone, email } = req.body;

      let subscriptionObj = subscription || null;
      if (!subscriptionObj && expo_push_token) subscriptionObj = String(expo_push_token).trim();
      if (!subscriptionObj) return res.status(400).json({ error: 'subscription or expo_push_token is required' });

      // Normalize subscription to an object that can be stored as jsonb
      let subscriptionJson = null;
      try {
        if (typeof subscriptionObj === 'string') {
          subscriptionJson = JSON.parse(subscriptionObj);
        } else {
          subscriptionJson = subscriptionObj;
        }
      } catch (e) {
        subscriptionJson = { token: String(subscriptionObj) };
      }

      // Ensure we always have an endpoint text value for upsert key
      const endpoint = (subscriptionJson && subscriptionJson.endpoint) ? subscriptionJson.endpoint : (subscriptionJson && subscriptionJson.token ? subscriptionJson.token : String(subscriptionObj));

      const user_type = req.userType === 'admin' ? 'admin' : 'customer';
      const user_id = req.userType === 'customer' ? (req.user && req.user.id ? req.user.id : null) : (req.admin && req.admin.id ? req.admin.id : null);

      // Debug logging: capture auth context and incoming payload to help diagnose admin vs customer saves
      try {
        console.log('push/register - auth context:', { userType: req.userType, user: req.user ? { id: req.user.id, email: req.user.email } : null, admin: req.admin ? { id: req.admin.id, email: req.admin.email } : null });
        console.log('push/register - incoming body keys:', Object.keys(req.body || {}));
      } catch (le) {}

      const payload = {
        endpoint,
        subscription: subscriptionJson,
        user_type,
        user_id: user_id ? String(user_id) : null,
        phone: phone ? String(phone).trim() : null,
        email: email ? String(email).trim() : null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase.from('push_subscriptions').upsert([payload], { onConflict: 'endpoint' }).select();
      if (error) {
        console.error('Failed to upsert push subscription:', error);
        return res.status(500).json({ error: 'Failed to register push subscription' });
      }

      res.json({ ok: true, data: data && data[0] ? data[0] : null });
    } catch (err) {
      console.error('push/register error:', err);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  });

  // Unregister a subscription (accepts { endpoint })
  router.post('/push/unregister', authenticateCustomerOrAdmin, async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });

      // Remove by exact endpoint match (we always store an `endpoint` text value)
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) {
        console.error('Failed to remove push subscription:', error);
        return res.status(500).json({ error: 'Failed to unregister push subscription' });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('push/unregister error:', err);
      res.status(500).json({ error: 'Failed to unregister push token' });
    }
  });

module.exports = router;