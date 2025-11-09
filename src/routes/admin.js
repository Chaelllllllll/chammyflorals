const express = require('express');
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // limit uploads to 5MB
const router = express.Router();

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

// Try to ensure the storage bucket exists (best-effort). This uses the service key so it can create buckets.
(async () => {
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

// Rate limit login attempts to mitigate brute force attacks
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
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
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    // Use timing-safe comparison to avoid leaking which part failed
    const crypto = require('crypto');
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

    if (!safeEqual(email, process.env.ADMIN_EMAIL) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
      console.log('Login failed for:', { email });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = Buffer.from(`${email}:${password}`).toString('base64');
    console.log('Login successful for admin');
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to process login' });
  }
});

router.get('/verify-token', auth, async (req, res) => {
  try {
    res.json({ valid: true });
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
      .select('id,name,image_url,image_path,category,pricing,addons,created_at')
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

router.patch('/orders/:orderId', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const updates = {};
    // Allow updating common order fields safely
    const allowed = ['name','email','fb_link','flower_type','quantity','addons','message','rush','total_fee','status','items'];
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
      if (updated && previousStatus !== updated.status && updated.email) {
        const templates = require('../lib/email-templates');
        const mailer = require('../lib/mailer');
        // If the new status is Delivered, send a friendly delivered/thank-you email
        if (String(updated.status || '').toLowerCase() === 'delivered') {
          const mail = templates.deliveredTemplate(updated);
          await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
        } else {
          const mail = templates.statusUpdateTemplate(updated, previousStatus);
          await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
        }
      }
    } catch (mailErr) {
      console.error('Failed to send status update/delivered email:', mailErr);
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
    const { received, receiverName } = req.body || {};
    // Fetch existing order
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Order not found' });

    // Update status only (do not persist receiverName or payment_received)
    const { data: updatedRows, error: updateErr } = await supabase.from('orders').update({ status: 'Delivered' }).eq('order_id', orderId).select();
    if (updateErr) throw updateErr;
    const updated = (updatedRows && updatedRows[0]) || existing;

    // Send delivered email including transient payment/receiver info (best-effort)
    try {
      const templates = require('../lib/email-templates');
      const mailer = require('../lib/mailer');
      // Build a shallow copy that includes transient fields for email rendering only
      const emailOrder = Object.assign({}, updated);
      if (typeof received !== 'undefined') emailOrder.payment_received = Number(received);
      if (receiverName) emailOrder.receiver_name = String(receiverName);
      if (emailOrder && emailOrder.email) {
        const mail = templates.deliveredTemplate(emailOrder);
        await mailer.sendMail({ to: emailOrder.email, subject: mail.subject, html: mail.html });
      }
    } catch (mailErr) {
      console.error('Failed to send delivered email (transient):', mailErr);
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
    const { name, image_url, image_path, category, pricing, addons } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const record = { name, image_url: image_url || null, image_path: image_path || null, category: category || null, pricing: pricing || null, addons: addons || null };

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
    try {
  const { data, error } = await supabase.from('products').insert([record]).select('id,name,image_url,image_path,category,pricing,addons,created_at');
      if (error) throw error;
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

    // Validate file type and size
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 5MB limit' });
    }
    console.log('Received multipart file:', { originalname: file.originalname, size: file.size, mimetype: file.mimetype });
    const ext = (file.mimetype && file.mimetype.split('/')[1]) || 'png';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
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
  const { name, image_url, image_path, category, pricing, addons } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    
    if (image_url !== undefined) updates.image_url = image_url;
    if (image_path !== undefined) updates.image_path = image_path;
    if (category !== undefined) updates.category = category;
    if (pricing !== undefined) updates.pricing = pricing;
    if (addons !== undefined) updates.addons = addons;

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
      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select('id,name,image_url,image_path,category,pricing,addons,created_at');
      if (error) throw error;
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