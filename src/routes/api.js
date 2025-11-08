const express = require('express');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const mailer = require('../lib/mailer');
const templates = require('../lib/email-templates');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const multer = require('multer');
// use memory storage so we can upload the buffer to Supabase storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const generateOrderId = () => {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
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

router.post('/inquiry', validate.inquiry, inquiryLimiter, async (req, res) => {
  try {
    // Log minimal info to avoid leaking PII in logs
    const safeEmail = (req.body.user_email || '').replace(/(.{2}).+(@.+)/, '$1***$2');
    console.log('Received inquiry from', { name: req.body.user_name, email: safeEmail });
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

    // reCAPTCHA removed: no client-side captcha required. Add server-side rate-limits/anti-abuse if needed.

    // Compute total using products/pricing stored in the DB (pricing is an array of rows per product).
    let totalFee = 0;
    try {
      const { data: products } = await supabase.from('products').select('id,name,pricing,addons');
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
            console.warn('Price not found for item code:', itemFlower, 'matchedProduct:', found && found.product ? found.product.name : null);
          }
          return { itemTotal, matched: !!found, matchedProduct: found && found.product ? found.product.name : null, matchedRow: found && found.row ? (found.row.label || found.row.set) : null };
        };

        if (Array.isArray(req.body.items) && req.body.items.length) {
          // multiple item order
          for (const it of req.body.items) {
            if (!it || !it.flower_type) continue;
            const info = computeFor(it.flower_type, it.quantity || 1);
            totalFee += info.itemTotal || 0;
          }
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
    } catch (err) {
      console.warn('Failed to compute price from products/pricing:', err);
    }

    const orderId = generateOrderId();
    // Simple server-side sanitization to strip tags from user-provided text fields
    const stripTags = (s) => String(s || '').replace(/<[^>]*>?/gm, '').trim();

    const orderData = {
      order_id: orderId,
      name: stripTags(user_name),
      email: String(user_email).trim(),
      fb_link: stripTags(fb_link) || 'Not provided',
      flower_type,
      quantity: parseInt(quantity) || 1,
      addons: Array.isArray(addons) ? addons.map(a => stripTags(a)) : [],
      message: stripTags(message) || 'Not provided',
      rush,
      total_fee: totalFee,
    };
    // Include optional phone and structured items when provided by the client
    if (req.body.phone) orderData.phone = String(req.body.phone).trim();
    if (Array.isArray(req.body.items) && req.body.items.length) {
      // sanitize items: { flower_type, quantity }
      orderData.items = req.body.items.map(it => ({
        flower_type: String(it.flower_type || it.flower || '').trim(),
        quantity: parseInt(it.quantity || it.qty || 1) || 1,
      }));
      // also keep backward-compatible summary fields
      orderData.flower_type = orderData.items.map(it => `${it.flower_type} x${it.quantity}`).join('; ');
      orderData.quantity = orderData.items.reduce((s, it) => s + (parseInt(it.quantity) || 0), 0) || 1;
    }
  console.log('Inserting order:', { order_id: orderId, name: orderData.name });

    const { data, error } = await supabase.from('orders').insert([orderData]).select();
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to save order to database' });
    }
    console.log('Supabase insert success:', data);

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
    } catch (discordErr) {
      console.warn('Failed to notify Discord webhook:', discordErr && discordErr.message ? discordErr.message : discordErr);
    }

  res.json({ message: 'Inquiry sent successfully!', orderId });
  } catch (error) {
    console.error('Inquiry error:', error);
    res.status(500).json({ error: 'Failed to process inquiry' });
  }
});

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
      created_at: data.created_at,
      items: data.items || null,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to track order' });
  }
});

// Debug endpoint: recompute total for an orderId using current products/pricing logic
router.get('/recompute-total/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { data: order, error: orderErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (orderErr || !order) return res.status(404).json({ error: 'Order not found' });

    const { data: products } = await supabase.from('products').select('id,name,pricing,addons');
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
    if (Array.isArray(order.items) && order.items.length) {
      for (const it of order.items) {
        const d = computeForDebug(it.flower_type || it.flower || '', it.quantity || it.qty || 1);
        recomputed += d.itemTotal || 0;
        details.push(d);
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
          } else {
            const d = computeForDebug(p, 1);
            recomputed += d.itemTotal || 0;
            details.push(d);
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

    const { data: products } = await supabase.from('products').select('id,name,pricing,addons');
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
      return { flower_type: itemFlower, qty, itemTotal, matchedProductName, matchedRowLabel };
    };

    const details = [];
    let recomputed = 0;
    const itemsArr = [];
    if (Array.isArray(order.items) && order.items.length) {
      for (const it of order.items) {
        const d = computeForDebug(it.flower_type || it.flower || '', it.quantity || it.qty || 1);
        recomputed += d.itemTotal || 0;
        details.push(d);
        itemsArr.push({ flower_type: d.flower_type, quantity: d.qty });
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
            itemsArr.push({ flower_type: d.flower_type, quantity: d.qty });
          } else {
            const d = computeForDebug(p, 1);
            recomputed += d.itemTotal || 0;
            details.push(d);
            itemsArr.push({ flower_type: d.flower_type, quantity: d.qty });
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
router.get('/products', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,image_url,category,pricing,addons')
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
router.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('id,name,slug').order('name', { ascending: true });
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
router.get('/reviews', async (req, res) => {
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
router.post('/reviews', upload.single('image'), async (req, res) => {
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

    // If an image was uploaded, upload it to Supabase Storage and attach the public URL
    if (req.file && req.file.buffer) {
      try {
        const supabase = require('../config/supabase');
        const bucket = process.env.SUPABASE_REVIEWS_BUCKET || 'reviews';
        const filename = `${String(orderId)}_${Date.now()}_${String(req.file.originalname || 'img').replace(/[^a-z0-9.\-]/gi,'')}`;
        const path = `${String(orderId)}/${filename}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage.from(bucket).upload(path, req.file.buffer, { contentType: req.file.mimetype });
        if (uploadErr) {
          console.warn('Failed to upload review image to storage:', uploadErr);
        } else {
          // get public URL
          try {
            const { data: urlData } = await supabase.storage.from(bucket).getPublicUrl(path);
            if (urlData && urlData.publicUrl) review.image_url = urlData.publicUrl;
          } catch (uerr) {
            console.warn('Failed to get public URL for review image:', uerr);
          }
        }
      } catch (err) {
        console.warn('Unexpected error uploading review image:', err);
      }
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