const fetch = global.fetch || require('node-fetch');

function safeString(v) {
  try { return (v == null) ? '' : String(v); } catch (e) { return '' }
}

function buildMessageText(order) {
  const id = safeString(order.order_id || order.orderId || '');
  const name = safeString(order.name || '');
  const fb = safeString(order.fb_link || order.facebook || 'Not provided');
  const items = (Array.isArray(order.items) && order.items.length) ? order.items.map(i => `${i.flower_type || i.name || ''} x${i.quantity || i.qty || 1}`).join('; ') : (safeString(order.flower_type || ''));
  const qty = safeString(order.quantity || (Array.isArray(order.items) ? order.items.reduce((s,i)=>s+(Number(i.quantity||i.qty||1)||0),0) : ''));
  const total = safeString(order.total_fee || order.total || '0');
  const status = safeString(order.status || 'Pending');
  const lines = [
    `New order received!`,
    `Order ID: ${id}`,
    name ? `Customer: ${name}` : null,
    fb ? `Facebook: ${fb}` : null,
    items ? `Items: ${items}` : null,
    qty ? `Quantity: ${qty}` : null,
    total ? `Total: ₱${total}` : null,
    `Status: ${status}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function notifyAdmins(order) {
  try {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) return { ok: false, message: 'Missing FB token' };

    // Primary source: explicit env var of admin PSIDs. Fallback: read from Supabase table `messenger_admins`.
    let psids = [];
    const psidsEnv = process.env.ADMIN_MESSENGER_PSIDS || process.env.FB_ADMIN_PSIDS || '';
    if (psidsEnv && psidsEnv.trim()) {
      psids = psidsEnv.split(',').map(s=>s.trim()).filter(Boolean);
    }
    if (!psids.length) {
      try {
        const supabase = require('../config/supabase');
        if (supabase) {
          const { data, error } = await supabase.from('messenger_admins').select('psid').limit(200);
          if (!error && Array.isArray(data)) {
            psids = data.map(r => String(r.psid)).filter(Boolean);
          }
        }
      } catch (dbErr) {
        console.warn('notifyAdmins: failed to read admin PSIDs from Supabase', dbErr && dbErr.message ? dbErr.message : dbErr);
      }
    }
    if (!psids.length) return { ok: false, message: 'No admin PSIDs configured or found in DB' };
    const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`;
    const text = buildMessageText(order);
    const results = [];
    for (const psid of psids) {
      try {
        const payload = { recipient: { id: psid }, message: { text } };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        let body = null;
        try { body = await res.json(); } catch (e) { body = null; }
        results.push({ psid, status: res.status, ok: res.ok, body });
      } catch (err) {
        results.push({ psid, ok: false, error: err && err.message ? err.message : String(err) });
      }
    }
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { notifyAdmins };
