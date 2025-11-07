const express = require('express');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const mailer = require('../lib/mailer');
const templates = require('../lib/email-templates');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();

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
          // fallback: product name match
          if (String(p.name || '').toUpperCase().includes(String(flower_type || '').toUpperCase())) {
            found = { product: p, row: null };
            break;
          }
        }
        const qty = parseInt(quantity) || 1;
        if (found && found.row && found.row.price != null) {
          totalFee = Number(found.row.price) * qty;
        } else if (found && found.product && Array.isArray(found.product.pricing) && found.product.pricing.length) {
          // fallback to first pricing row with a price
          const r = found.product.pricing.find(x => x.price != null);
          totalFee = r ? Number(r.price) * qty : 0;
        } else {
          totalFee = 0;
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
              // try to find a trailing number
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
      total_fee: data.total_fee,
      status: data.status,
      created_at: data.created_at,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to track order' });
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

module.exports = router;