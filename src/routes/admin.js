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
    const { data, error } = await supabase.from('categories').select('id,name,slug').order('name', { ascending: true });
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
    const { data, error } = await supabase.from('categories').insert([{ name: String(name).trim(), slug }]).select('id,name,slug');
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
    const { data, error } = await supabase.from('categories').update(updates).eq('id', id).select('id,name,slug');
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
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Fetch existing order to get previous status and customer email
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
    if (fetchErr) {
      console.error('Failed to fetch order before update:', fetchErr);
    }
    const previousStatus = existing ? existing.status : null;

    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('order_id', orderId);
    if (error) throw error;

    // After successful update, send status-change email (best-effort)
    try {
      if (existing && existing.email) {
        const { data: updated } = await supabase.from('orders').select('*').eq('order_id', orderId).single();
        const templates = require('../lib/email-templates');
        const mail = templates.statusUpdateTemplate(updated, previousStatus);
        const mailer = require('../lib/mailer');
        await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
      }
    } catch (mailErr) {
      console.error('Failed to send status update email:', mailErr);
    }

    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
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
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
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