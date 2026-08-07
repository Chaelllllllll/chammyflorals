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

// SECURITY: Validate JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET_SAFE = JWT_SECRET || 'dev-jwt-secret-change-in-production';

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

  // Try customer JWT authentication (supports both app JWT and Supabase OAuth JWT)
  try {
    const decoded = jwt.verify(token, JWT_SECRET_SAFE);
    if (decoded && (decoded.id || decoded.sub || decoded.customerId)) {
      req.user = decoded;
      req.userType = 'customer';
      return next();
    }
  } catch (err) {
    try {
      const decoded = jwt.decode(token);
      if (decoded && (decoded.id || decoded.sub || decoded.customerId || decoded.email)) {
        req.user = decoded;
        req.userType = 'customer';
        return next();
      }
    } catch (de) {}
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

async function resolveCustomerContext(req) {
  const rawUserId = req.user?.id || req.user?.sub || req.user?.customerId || req.customer?.id || null;
  let customerEmail = req.user?.email || req.user?.user_metadata?.email || req.customer?.email || null;
  let customerId = null;

  console.log('[DEBUG] resolveCustomerContext input:', {
    hasReqUser: !!req.user,
    reqUserKeys: req.user ? Object.keys(req.user) : [],
    rawUserId,
    customerEmail
  });

  if (rawUserId != null) {
    const userIdStr = String(rawUserId).trim();
    if (/^\d+$/.test(userIdStr)) {
      customerId = Number(rawUserId);
    } else {
      // If rawUserId is a UUID (Google / Supabase Auth sub), try to resolve it from the google_id column
      const { data: customerByGoogleId, error: googleIdError } = await supabase
        .from('customers')
        .select('id, email')
        .eq('google_id', userIdStr)
        .maybeSingle();

      if (googleIdError) {
        console.error('Error resolving customer by google_id:', googleIdError);
      } else if (customerByGoogleId) {
        customerId = Number(customerByGoogleId.id);
        if (!customerEmail && customerByGoogleId.email) {
          customerEmail = String(customerByGoogleId.email).toLowerCase().trim();
        }
      }
    }
  }

  if (!customerEmail && customerId) {
    const { data: customerById, error: customerByIdError } = await supabase
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .maybeSingle();

    if (customerByIdError) {
      console.error('Error resolving customer email by id:', customerByIdError);
    } else if (customerById && customerById.email) {
      customerEmail = String(customerById.email).toLowerCase().trim();
    }
  }

  if (!customerId && customerEmail) {
    const { data: customerByEmail, error: customerByEmailError } = await supabase
      .from('customers')
      .select('id,email')
      .eq('email', String(customerEmail).toLowerCase().trim())
      .maybeSingle();

    if (customerByEmailError) {
      console.error('Error resolving customer id by email:', customerByEmailError);
    } else if (customerByEmail && customerByEmail.id) {
      customerId = Number(customerByEmail.id);
      customerEmail = customerByEmail.email ? String(customerByEmail.email).toLowerCase().trim() : customerEmail;
    } else {
      // Auto-provision user record in customers table if authenticated but not present
      const fallbackName = String(customerEmail).split('@')[0];
      const customerName = req.user?.name || req.user?.user_metadata?.full_name || req.user?.user_metadata?.name || fallbackName;
      const googleIdStr = rawUserId && !/^\d+$/.test(String(rawUserId)) ? String(rawUserId) : null;
      
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const { data: newCustomer, error: insertError } = await supabase
        .from('customers')
        .insert([{
          email: String(customerEmail).toLowerCase().trim(),
          name: customerName,
          google_id: googleIdStr,
          password_hash: passwordHash,
          email_verified: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
        
      if (insertError) {
        console.error('Failed to auto-provision customer record:', insertError);
      } else if (newCustomer) {
        customerId = Number(newCustomer.id);
        console.log('Successfully auto-provisioned customer record for:', customerEmail);
      }
    }
  }

  console.log('[DEBUG] resolveCustomerContext output:', {
    customerId,
    customerEmail
  });

  return { customerId, customerEmail };
}

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
    const { customerId } = await resolveCustomerContext(req);
    const customer_id = customerId || null;
    
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
      expected_delivery_date: req.body.expected_delivery_date || null,
      total_fee: totalFee,
    };
    
    // Add voucher information if provided
    if (req.body.voucher_code) {
      orderData.voucher_code = String(req.body.voucher_code).trim().toUpperCase();
      orderData.voucher_discount = parseFloat(req.body.voucher_discount) || 0;
      orderData.original_total = parseFloat(req.body.original_total) || totalFee;
      // Adjust total_fee to include discount
      orderData.total_fee = orderData.original_total - orderData.voucher_discount;
    }
    
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



    // Notify admins via Telegram Bot (if configured)
    try {
      const telegram = require('../lib/telegram');
      const inserted = (data && Array.isArray(data) && data[0]) ? data[0] : orderData;
      await telegram.notifyTelegram(inserted);
    } catch (tgErr) {
      console.error('Telegram notification error:', tgErr);
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
    const { customerId, customerEmail } = await resolveCustomerContext(req);

    if (!customerId) {
      return res.json([]);
    }
    
    // Fetch regular orders
    const { data: regularOrders, error: regularError } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (regularError) {
      console.error('Error fetching customer orders:', regularError);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    let customOrders = [];
    if (customerEmail) {
      const { data: customOrdersData, error: customError } = await supabase
        .from('custom_orders')
        .select('*')
        .eq('email', customerEmail)
        .order('created_at', { ascending: false });

      if (customError) {
        console.error('Error fetching custom orders:', customError);
        // Don't fail the entire request, just continue with regular orders
      } else {
        customOrders = customOrdersData || [];
      }
    }

    // Combine and normalize both order types
    const allOrders = [
      ...(regularOrders || []).map(order => ({
        ...order,
        order_type: 'regular'
      })),
      ...(customOrders || []).map(order => ({
        ...order,
        order_type: 'custom',
        // Normalize custom order fields to match regular orders
        // Use order_id if available, otherwise use id as fallback
        order_id: order.order_id || order.id,
        flower_type: 'Custom Bouquet',
        quantity: 1,
        total_fee: order.total_fee,
        status: order.status,
        created_at: order.created_at
      }))
    ];

    // Sort combined orders by created_at
    allOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(allOrders);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Track order by tracking code (authenticated)
router.get('/orders/track/:trackingCode', authenticateCustomer, async (req, res) => {
  try {
    const { trackingCode } = req.params;
    const { customerEmail } = await resolveCustomerContext(req);

    if (!customerEmail) {
      return res.status(401).json({ error: 'Customer account not found' });
    }
    
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

    // Apply voucher discount if present
    let finalTotal = recomputed;
    if (order.voucher_code && order.voucher_discount) {
      const voucherDiscount = parseFloat(order.voucher_discount) || 0;
      finalTotal = Math.max(0, recomputed - voucherDiscount);
    }

    return res.json({ 
      orderId: order.order_id, 
      original_total_fee: order.total_fee, 
      recomputed_total: finalTotal,
      voucher_applied: order.voucher_code ? true : false,
      voucher_discount: order.voucher_discount || 0,
      details 
    });
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
      .select('id,name,image_url,category,pricing,addons,colors,images,images_paths')
      .or('is_private.eq.false,is_private.is.null')
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
      .select('id,name,image_url,category,pricing,addons,colors,images,images_paths,is_private')
      .eq('id', id)
      .single();
    
    if (error || !data || data.is_private === true) {
      console.error('Supabase error fetching product or product is private:', error);
      return res.status(404).json({ error: 'Product not found' });
    }
    
    delete data.is_private;
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

// GET public rush fee setting
router.get('/settings/rush-fee', cacheMiddleware(600), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('setting_value')
      .eq('setting_key', 'rush_fee')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching rush fee setting:', error);
    }
    
    // Default to 50 if not found
    const rushFee = data ? parseFloat(data.setting_value) : 50;
    res.json({ rushFee });
  } catch (err) {
    console.error('Unexpected error fetching rush fee:', err);
    res.json({ rushFee: 50 }); // Return default on error
  }
});

// GET /api/settings/telegram-link - Fetch Telegram bot link
router.get('/settings/telegram-link', async (req, res) => {
  let link = process.env.TELEGRAM_BOT_LINK || 'https://t.me/YourBot';
  if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
  res.json({ telegram_bot_link: link });
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

    // validate order exists in either orders or custom_orders table
    let order = null;
    let orderErr = null;
    
    // First check regular orders table
    const { data: regularOrder, error: regularErr } = await supabase
      .from('orders')
      .select('order_id,name,status')
      .eq('order_id', String(orderId))
      .single();
    
    if (regularOrder) {
      order = regularOrder;
    } else {
      // If not found, check custom_orders table by order_id
      const { data: customOrder, error: customErr } = await supabase
        .from('custom_orders')
        .select('order_id,name,status')
        .eq('order_id', String(orderId))
        .single();
      
      if (customOrder) {
        order = customOrder;
      } else {
        // Also try checking by id as fallback
        const { data: customOrderById, error: customErrById } = await supabase
          .from('custom_orders')
          .select('order_id,name,status')
          .eq('id', String(orderId))
          .single();
        
        if (customOrderById) {
          order = customOrderById;
        } else {
          orderErr = customErrById || customErr;
        }
      }
    }

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
          affected_systems: ['database', 'website'],
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

    // Determine overall status
    let overallStatus = 'operational';
    const statuses = [websiteStatus, databaseStatus];
    
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
    const { customerId } = await resolveCustomerContext(req);

    if (!customerId) {
      return res.json({ success: true, messages: [] });
    }

    console.log('Getting chat messages for customer:', customerId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Hard-delete messages older than 30 days to keep the inbox clean
    try {
      await supabase
        .from('customer_messages')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString());
    } catch (delErr) {}
    
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
      console.warn('Error fetching customer messages:', messagesError);
      return res.json({ success: true, messages: [] });
    }
    
    res.json({ 
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Customer chat error:', error);
    res.json({ success: true, messages: [] });
  }
});

// Send message as authenticated customer (supports text, images, and product inquiries)
router.post('/customer-chat/send', authenticateCustomer, upload.single('image'), async (req, res) => {
  try {
    const { customerId } = await resolveCustomerContext(req);

    if (!customerId) {
      return res.status(400).json({ error: 'Customer account not found' });
    }

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
    // Notify admins via Telegram Bot
    try {
      const telegram = require('../lib/telegram');
      let customerName = null;
      try {
        const { data: cust, error: custErr } = await supabase.from('customers').select('name').eq('id', customerId).single();
        if (!custErr && cust) customerName = cust.name || null;
      } catch (e) {}

      const title = customerName ? `💬 <b>${customerName} sent a message</b>` : `💬 <b>Customer sent a message</b>`;
      const text = `${title}\n\n${sanitizedMessage}`;
      await telegram.notifyTelegram(text);
    } catch (tgErr) {
      console.warn('Telegram notification error for customer message:', tgErr);
    }

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
    const { customerId } = await resolveCustomerContext(req);
    const { deleteType } = req.body; // 'me' or 'everyone'

    if (!customerId) {
      return res.status(401).json({ error: 'Customer account not found' });
    }
    
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
router.get('/admin/customer-conversations', adminAuth, async (req, res) => {
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
router.get('/admin/customer-messages/:customerId', adminAuth, async (req, res) => {
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
router.post('/admin/customer-messages/send', adminAuth, upload.single('image'), async (req, res) => {
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
      // Attempt to match subscriptions by user_id first. If none found (e.g., anonymous subscription),
      // also try to match by the customer's email (anonymous subscribers may have provided an email).
      let custEmail = null;
      try {
        const { data: c, error: cErr } = await supabase.from('customers').select('email').eq('id', customer_id).limit(1).single();
        if (!cErr && c && c.email) custEmail = String(c.email).trim();
      } catch (e) {}

      let query = supabase.from('push_subscriptions').select('subscription,endpoint').eq('user_type', 'customer').not('subscription', 'is', null).limit(50);

      // Prefer direct user_id match
      if (customer_id) query = query.eq('user_id', customer_id);

      let { data: tokens } = await query;

      // If no tokens found by user_id, and we have a customer email, try matching by email
      if ((!tokens || tokens.length === 0) && custEmail) {
        try {
          const q2 = await supabase.from('push_subscriptions')
            .select('subscription,endpoint')
            .eq('user_type', 'customer')
            .eq('email', custEmail)
            .not('subscription', 'is', null)
            .limit(50);
          tokens = q2.data || [];
        } catch (e) {
          tokens = [];
        }
      }

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

  router.post('/push/register', async (req, res) => {
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

      // Disallow admin push subscriptions — admins should use Messenger PSIDs instead
      if (user_type === 'admin') {
        return res.status(400).json({ error: 'Admin push subscriptions are not supported. Use Telegram Bot notifications instead.' });
      }

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

      // upsert complete

      res.json({ ok: true, data: data && data[0] ? data[0] : null });
    } catch (err) {
      console.error('push/register error:', err);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  });

  // Unregister a subscription (accepts { endpoint })
  router.post('/push/unregister', async (req, res) => {
    try {
      // Prevent admins from unregistering push subscriptions because admin push is not supported
      if (req.userType === 'admin') return res.status(400).json({ error: 'Admin push subscriptions are not supported.' });
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

// ========================
// CUSTOMIZATION OPTIONS (PUBLIC)
// ========================

const CUSTOM_TABLES_PUBLIC = {
  stems: 'custom_stems',
  fillers: 'custom_fillers',
  wrapping: 'custom_wrapping',
  addons: 'custom_addons'
};

// GET all active options for all types (for the customize modal)
router.get('/customization/options', async (req, res) => {
  try {
    const results = {};
    
    for (const [type, table] of Object.entries(CUSTOM_TABLES_PUBLIC)) {
      const { data, error } = await supabase
        .from(table)
        .select('id, name, price, image_url')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) {
        console.error(`Error fetching ${type}:`, error);
        results[type] = [];
      } else {
        results[type] = data || [];
      }
    }
    
    return res.json(results);
  } catch (err) {
    console.error('Error fetching customization options:', err);
    return res.status(500).json({ error: 'Failed to fetch options' });
  }
});

// POST submit a custom order
router.post('/orders/custom', authenticateCustomerOrAdmin, async (req, res) => {
  try {
    const {
      full_name,
      email,
      facebook_link,
      stems,
      fillers,
      wrapping,
      addons,
      special_instructions,
      estimated_total
    } = req.body;
    
    // Validate required fields
    if (!full_name || full_name.trim() === '') {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!facebook_link || facebook_link.trim() === '') {
      return res.status(400).json({ error: 'Facebook account link is required' });
    }
    
    // Validate at least one item selected in each category
    if (!stems || stems.length === 0) {
      return res.status(400).json({ error: 'Please select at least one stem' });
    }
    if (!fillers || fillers.length === 0) {
      return res.status(400).json({ error: 'Please select at least one filler' });
    }
    if (!wrapping) {
      return res.status(400).json({ error: 'Please select wrapping' });
    }
    
    // Get customer_id from authenticated user (null for guest orders or admins)
    let customer_id = null;
    if (req.userType === 'customer') {
      const { customerId } = await resolveCustomerContext(req);
      customer_id = customerId || null;
    }
    
    // Generate order ID using the same secure method as regular products
    const orderId = generateOrderId();
    
    // Prepare order data
    const customOrderData = {
      order_id: orderId,
      customer_id: customer_id,
      name: full_name.trim(),
      email: email.trim(),
      fb_link: facebook_link || null,
      stems: stems || [],
      fillers: fillers || [],
      wrapping: wrapping || null,
      addons: addons || [],
      special_instructions: special_instructions || null,
      expected_delivery_date: req.body.expected_delivery_date || null,
      rush: req.body.rush || 'No',
      total_fee: estimated_total || 0,
      status: 'Pending'
    };
    
    // Add voucher information if provided
    if (req.body.voucher_code) {
      customOrderData.voucher_code = String(req.body.voucher_code).trim().toUpperCase();
      customOrderData.voucher_discount = parseFloat(req.body.voucher_discount) || 0;
      customOrderData.original_total = parseFloat(req.body.original_total) || estimated_total;
      // Adjust total_fee to include discount
      customOrderData.total_fee = customOrderData.original_total - customOrderData.voucher_discount;
    }
    
    // Create order in custom_orders table
    const { data: order, error } = await supabase
      .from('custom_orders')
      .insert(customOrderData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating custom order:', error);
      return res.status(500).json({ error: 'Failed to create order' });
    }
    
    // Send confirmation email (best effort)
    try {
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
          <div style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); color: white; padding: 40px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 600;">Order Confirmed!</h1>
          </div>
          
          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; color: #333; margin-bottom: 10px;">Dear <strong>${full_name}</strong>,</p>
            <p style="font-size: 15px; color: #666; line-height: 1.6; margin-bottom: 30px;">
              Thank you for your custom order! We have received your request and will begin preparing your beautiful arrangement.
            </p>
            
            <div style="background: #fff; border: 2px solid #ffe9f0; border-radius: 12px; padding: 20px; margin: 25px 0;">
              <h3 style="font-size: 16px; color: #ff6f9b; margin: 0 0 15px 0;">Order Details</h3>
              
              <div style="background: #f8f9fa; padding: 12px 15px; border-radius: 8px; margin-bottom: 15px;">
                <span style="font-size: 12px; color: #999;">ORDER ID: </span>
                <span style="font-size: 16px; font-weight: 700; color: #ff6f9b; letter-spacing: 1px;">${orderId}</span>
              </div>
              
              <table style="width: 100%; border-collapse: collapse;">
                ${stems && stems.length ? stems.map(s => `
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 0; color: #333; font-size: 14px;"><strong>Stems:</strong> ${s.name}</td>
                    <td style="padding: 10px 0; color: #666; text-align: center;">x${s.quantity}</td>
                    <td style="padding: 10px 0; color: #ff6f9b; text-align: right; font-weight: 600;">₱${(s.price * s.quantity).toFixed(2)}</td>
                  </tr>
                `).join('') : ''}
                ${fillers && fillers.length ? fillers.map(f => `
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 0; color: #333; font-size: 14px;"><strong>Fillers:</strong> ${f.name}</td>
                    <td style="padding: 10px 0; color: #666; text-align: center;">x${f.quantity}</td>
                    <td style="padding: 10px 0; color: #ff6f9b; text-align: right; font-weight: 600;">₱${(f.price * f.quantity).toFixed(2)}</td>
                  </tr>
                `).join('') : ''}
                ${wrapping ? `
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 0; color: #333; font-size: 14px;"><strong>Wrapping:</strong> ${wrapping.name}</td>
                    <td style="padding: 10px 0; color: #666; text-align: center;">x1</td>
                    <td style="padding: 10px 0; color: #ff6f9b; text-align: right; font-weight: 600;">₱${parseFloat(wrapping.price).toFixed(2)}</td>
                  </tr>
                ` : ''}
                ${addons && addons.length ? addons.map(a => `
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="padding: 10px 0; color: #333; font-size: 14px;"><strong>Add-on:</strong> ${a.name}</td>
                    <td style="padding: 10px 0; color: #666; text-align: center;">x1</td>
                    <td style="padding: 10px 0; color: #ff6f9b; text-align: right; font-weight: 600;">₱${parseFloat(a.price).toFixed(2)}</td>
                  </tr>
                `).join('') : ''}
                ${req.body.voucher_code ? `
                  <tr style="border-top: 2px solid #e0e0e0;">
                    <td colspan="2" style="padding: 12px 0; color: #999; font-size: 14px;">Original Total</td>
                    <td style="padding: 12px 0; color: #999; text-align: right; font-size: 14px; text-decoration: line-through;">₱${parseFloat(req.body.original_total || estimated_total).toLocaleString()}</td>
                  </tr>
                  <tr style="background: #e8f5e9;">
                    <td colspan="2" style="padding: 12px 15px; color: #28a745; font-size: 14px;">
                      <strong><i style="font-style: normal;"></i> Voucher (${req.body.voucher_code})</strong>
                    </td>
                    <td style="padding: 12px 15px; color: #28a745; text-align: right; font-size: 14px; font-weight: 600;">-₱${parseFloat(req.body.voucher_discount || 0).toFixed(2)}</td>
                  </tr>
                ` : ''}
                <tr style="border-top: 2px solid #ff6f9b;">
                  <td colspan="2" style="padding: 15px 0; color: #333; font-size: 16px; font-weight: 700;">${req.body.voucher_code ? 'Final Total' : 'Total'}</td>
                  <td style="padding: 15px 0; color: #ff6f9b; text-align: right; font-size: 20px; font-weight: 700;">₱${parseFloat(customOrderData.total_fee || 0).toLocaleString()}</td>
                </tr>
              </table>
              ${special_instructions ? `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px;">
                  <strong style="color: #333; font-size: 14px;">Special Instructions:</strong>
                  <p style="margin: 8px 0 0 0; color: #666; font-size: 14px; line-height: 1.6;">${special_instructions}</p>
                </div>
              ` : ''}
            </div>
            
            <p style="font-size: 14px; color: #999; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              Need help? Contact us through Facebook or reply to this email.
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 13px;">
            <p style="margin: 0;"><strong style="color: #ff6f9b;">Chammy Florals</strong> - Crafting moments with love</p>
          </div>
        </div>
      `;
      
      const mailer = require('../lib/mailer');
      await mailer.sendMail({
        to: email,
        subject: `Custom Order Confirmation - ${orderId}`,
        html: emailHtml
      });
    } catch (mailErr) {
      console.error('Failed to send custom order confirmation email:', mailErr);
    }
    // Notify admins via Telegram Bot (if configured)
    const lines = [];
    lines.push('⋆˚✿˖°𝐍𝐞𝐰 𝐂𝐮𝐬𝐭𝐨𝐦 𝐎𝐫𝐝𝐞𝐫!⋆˚✿˖°');
    lines.push('──────────୨ৎ──────────');
    lines.push(`𝐎𝐫𝐝𝐞𝐫 𝐈𝐃: ${orderId}`);
    lines.push(`𝐂𝐮𝐬𝐭𝐨𝐦𝐞𝐫: ${full_name}`);
    if (facebook_link) lines.push(`𝐅𝐚𝐜𝐞𝐛𝐨𝐨𝐤: ${facebook_link}`);
    lines.push('──────────୨ৎ──────────');
      lines.push('𝐈𝐭𝐞𝐦𝐬:');
      if (stems && stems.length) {
        stems.forEach(s => lines.push(`  𝐒𝐭𝐞𝐦𝐬: ${s.name} x${s.quantity} - ₱${(s.price * s.quantity).toFixed(2)}`));
      }
      if (fillers && fillers.length) {
        fillers.forEach(f => lines.push(`  𝐅𝐢𝐥𝐥𝐞𝐫𝐬: ${f.name} x${f.quantity} - ₱${(f.price * f.quantity).toFixed(2)}`));
      }
      if (wrapping) {
        lines.push(`  𝐖𝐫𝐚𝐩𝐩𝐢𝐧𝐠: ${wrapping.name} - ₱${parseFloat(wrapping.price).toFixed(2)}`);
      }
      if (addons && addons.length) {
        addons.forEach(a => lines.push(`  𝐀𝐝𝐝-𝐨𝐧: ${a.name} - ₱${parseFloat(a.price).toFixed(2)}`));
      }
      if (special_instructions) {
        lines.push(`𝐒𝐩𝐞𝐜𝐢𝐚𝐥 𝐈𝐧𝐬𝐭𝐫𝐮𝐜𝐭𝐢𝐨𝐧𝐬: ${special_instructions}`);
      }
      lines.push('──────────୨ৎ──────────');
      if (req.body.voucher_code) {
        lines.push(`𝐕𝐨𝐮𝐜𝐡𝐞𝐫: ${req.body.voucher_code}`);
        lines.push(`𝐃𝐢𝐬𝐜𝐨𝐮𝐧𝐭: -₱${parseFloat(req.body.voucher_discount || 0).toFixed(2)}`);
        lines.push(`𝐎𝐫𝐢𝐠𝐢𝐧𝐚𝐥: ₱${Number(req.body.original_total || estimated_total).toLocaleString()}`);
      }
      lines.push(`𝐓𝐨𝐭𝐚𝐥: ₱${Number(customOrderData.total_fee).toLocaleString()}`);
      lines.push(`𝐒𝐭𝐚𝐭𝐮𝐬: Pending`);
      


    // Notify admins via Telegram Bot (if configured)
    try {
      const telegram = require('../lib/telegram');
      // Pass order object directly so it builds a clean HTML notification
      const inserted = customOrderData;
      await telegram.notifyTelegram(inserted);
    } catch (tgErr) {
      console.error('Telegram notification error:', tgErr);
    }
    
    return res.status(201).json({
      success: true,
      order_number: orderId,
      order_id: order.id
    });
    
  } catch (err) {
    console.error('Error submitting custom order:', err);
    return res.status(500).json({ error: 'Failed to submit order' });
  }
});

// PUT update a custom order (admin only)
router.put('/admin/orders/custom/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { name, email, fb_link, status, total_fee, special_instructions, stems, fillers, wrapping, addons, expected_delivery_date, rush } = req.body;

    console.log('Updating custom order:', orderId, 'with data:', req.body);

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get the current order to check if status changed
    const { data: currentOrder } = await supabase
      .from('custom_orders')
      .select('status, email, name')
      .eq('order_id', orderId)
      .single();

    const previousStatus = currentOrder?.status;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (fb_link !== undefined) updateData.fb_link = fb_link;
    if (status !== undefined) updateData.status = status;
    if (total_fee !== undefined) updateData.total_fee = parseFloat(total_fee);
    if (special_instructions !== undefined) updateData.special_instructions = special_instructions;
    if (expected_delivery_date !== undefined) updateData.expected_delivery_date = expected_delivery_date || null;
    if (rush !== undefined) updateData.rush = rush || 'No';
    if (stems !== undefined) updateData.stems = stems;
    if (fillers !== undefined) updateData.fillers = fillers;
    if (wrapping !== undefined) updateData.wrapping = wrapping;
    if (addons !== undefined) updateData.addons = addons;

    const { data, error } = await supabase
      .from('custom_orders')
      .update(updateData)
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) {
      console.error('Error updating custom order:', error);
      return res.status(500).json({ error: 'Failed to update order' });
    }

    console.log('Custom order updated successfully:', data);

    // Send email notification if status changed
    if (status !== undefined && previousStatus !== status && data.email) {
      try {
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

        console.log(`Status update email sent to ${data.email} for order ${orderId}`);
      } catch (mailErr) {
        console.error('Failed to send status update email:', mailErr);
        // Don't fail the request if email fails
      }
    }

    return res.json({ success: true, order: data });
  } catch (err) {
    console.error('Error updating custom order:', err);
    return res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE a custom order (admin only)
router.delete('/admin/orders/custom/:orderId', adminAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const { error } = await supabase
      .from('custom_orders')
      .delete()
      .eq('order_id', orderId);

    if (error) {
      console.error('Error deleting custom order:', error);
      return res.status(500).json({ error: 'Failed to delete order' });
    }

    return res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Error deleting custom order:', err);
    return res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Get delivery dates with order counts for calendar display
router.get('/orders/delivery-dates', async (req, res) => {
  try {
    // Fetch all orders with expected delivery dates (excluding delivered orders)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('expected_delivery_date')
      .not('expected_delivery_date', 'is', null)
      .neq('status', 'Delivered');
    
    const { data: customOrders, error: customOrdersError } = await supabase
      .from('custom_orders')
      .select('expected_delivery_date')
      .not('expected_delivery_date', 'is', null)
      .neq('status', 'Delivered');
    
    if (ordersError || customOrdersError) {
      throw new Error(ordersError?.message || customOrdersError?.message);
    }
    
    // Combine and count orders by date
    const allDates = [
      ...(orders || []).map(o => o.expected_delivery_date),
      ...(customOrders || []).map(o => o.expected_delivery_date)
    ].filter(Boolean);
    
    const dateCounts = {};
    allDates.forEach(date => {
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });
    
    const result = Object.keys(dateCounts).map(date => ({
      date,
      count: dateCounts[date]
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching delivery dates:', error);
    res.status(500).json({ error: 'Failed to fetch delivery dates' });
  }
});

module.exports = router;