const express = require('express');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const { validateOrderCreation, validateReview, sanitizeBody } = require('../middleware/validators');
const { cacheMiddleware, clearCache } = require('../middleware/cache');
const mailer = require('../lib/mailer');
const templates = require('../lib/email-templates');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');

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
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
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

router.post('/inquiry', validate.inquiry, sanitizeBody, inquiryLimiter, async (req, res) => {
  try {
    // Log minimal info to avoid leaking PII in logs
    const safeEmail = (req.body.user_email || '').replace(/(.{2}).+(@.+)/, '$1***$2');// SECURITY FIX: Sanitize user inputs
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
        if (addons && Array.isArray(addons)) {
          for (const a of addons) {
            if (!a) continue;
            const str = String(a);
            const m = str.match(/₱\s?([0-9,]+(?:\.\d+)?)/);
            if (m && m[1]) {
              const num = Number(m[1].replace(/,/g, ''));
              if (!Number.isNaN(num)) totalFee += num;
            } else {
              const mm = str.match(/(\d+(?:,\d+)?)(?:\s*PHP|\s*₱)?$/);
              if (mm && mm[1]) {
                const num = Number(mm[1].replace(/,/g, ''));
                if (!Number.isNaN(num)) totalFee += num;
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
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !data) {
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
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_url,category,pricing,addons,colors')
      .order('id', { ascending: true });
    if (error) {
      console.error('Error fetching public products:', error);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
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
    const { data, error } = await supabase
      .from('reviews')
      .select('id,order_id,name,stars,message,image_url,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.error('Error fetching reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }
    res.json(data || []);
  } catch (err) {
    console.error('Unexpected error fetching reviews:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
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

module.exports = router;