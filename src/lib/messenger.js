const fetch = global.fetch || require('node-fetch');

function safeString(v) {
  try { return (v == null) ? '' : String(v); } catch (e) { return '' }
}

function buildMessageText(order) {
  const id = safeString(order.order_id || order.orderId || '');
  const name = safeString(order.name || '');
  // Prefer explicit customer facebook link stored on the order; fall back to SITE_BASE_URL
  const fb = safeString(order.fb_link || order.facebook || process.env.SITE_BASE_URL || '');
  // Build items list
  let itemsList = [];
  if (Array.isArray(order.items) && order.items.length) {
    itemsList = order.items.map(i => {
      const label = safeString(i.flower_type || i.name || i.code || 'Item');
      const q = Number(i.quantity || i.qty || 1) || 1;
      return `${label} x${q}`;
    });
  } else if (order.flower_type) {
    // handle possibly CSV or array-like stored fields
    let types = order.flower_type;
    let qtys = order.quantity;
    try {
      if (typeof types === 'string' && types.trim().startsWith('[')) types = JSON.parse(types);
      if (typeof qtys === 'string' && qtys.trim().startsWith('[')) qtys = JSON.parse(qtys);
    } catch (e) {}
    if (Array.isArray(types)) {
      types.forEach((t, i) => {
        const q = Array.isArray(qtys) ? Number(qtys[i] || qtys[0] || 1) : Number(qtys || 1);
        itemsList.push(`${safeString(t)} x${q || 1}`);
      });
    } else {
      const q = Array.isArray(qtys) ? Number(qtys[0] || 1) : Number(qtys || 1);
      itemsList.push(`${safeString(types)} x${q || 1}`);
    }
  }

  const total = safeString(order.total_fee || order.total || '0');
  const status = safeString(order.status || 'Pending');
  const totalQty = (Array.isArray(order.items) && order.items.length) ? order.items.reduce((s,i)=>s+(Number(i.quantity||i.qty||1)||0),0) : (Array.isArray(order.quantity) ? order.quantity.reduce((s,q)=>s+Number(q||0),0) : (Number(order.quantity) || 0));

  const header = '⋆˚✿˖° 𝐍𝐞𝐰 𝐎𝐫𝐝𝐞𝐫 𝐑𝐞𝐜𝐞𝐢𝐯𝐞𝐝! ⋆˚✿˖°';
  const sep = '──────────୨ৎ──────────';
  const lines = [];
  lines.push(header);
  lines.push(sep);
  lines.push(`𝗢𝗿𝗱𝗲𝗿 𝗜𝗗: ${id}`);
  if (name) lines.push(`𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿: ${name}`);
  if (fb) lines.push(`𝗙𝗮𝗰𝗲𝗯𝗼𝗼𝗸: ${fb}`);
  if (itemsList.length) lines.push(`𝗜𝘁𝗲𝗺𝘀: ${itemsList.join('; ')}`);
  if (totalQty) lines.push(`𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆: ${totalQty}`);
  lines.push(`𝗦𝘁𝗮𝘁𝘂𝘀: ${status}`);
  lines.push(sep);
  if (total) lines.push(`𝗧𝗼𝘁𝗮𝗹: ₱${Number(total).toLocaleString()}`);
  return lines.join('\n');
}

async function notifyAdmins(order) {
  try {
    const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) return { ok: false, message: 'Missing FB token' };

  // Primary source: explicit env var of admin PSIDs. Fallback: read from Supabase table `admins` (approved rows with psid).
    let psids = [];
    const psidsEnv = process.env.ADMIN_MESSENGER_PSIDS || process.env.FB_ADMIN_PSIDS || '';
    if (psidsEnv && psidsEnv.trim()) {
      psids = psidsEnv.split(',').map(s=>s.trim()).filter(Boolean);
    }
    if (!psids.length) {
      try {
        const supabase = require('../config/supabase');
        if (supabase) {
          // Read admins table and only include those with an approved status and a PSID
          const { data, error } = await supabase.from('admins').select('id,psid,status').limit(200);
          if (!error && Array.isArray(data)) {
            psids = (data || [])
              .filter(r => r && r.psid && String(r.status || '').toLowerCase() === 'approved')
              .map(r => String(r.psid))
              .filter(Boolean);
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

// Send a direct message to a single PSID (page sends). `message` can be string or message object.
// If outside the 24h window (policy error code 10 / subcode 2018278) we retry once with MESSAGE_TAG ACCOUNT_UPDATE.
async function sendToPsid(psid, message) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, message: 'Missing FB token' };
  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const baseMsg = (typeof message === 'string' ? { text: message } : message);

  async function post(payload) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let body = null; try { body = await res.json(); } catch (e) { body = null; }
    return { ok: res.ok, status: res.status, body };
  }

  try {
    const payload = { recipient: { id: String(psid) }, message: baseMsg };
    const first = await post(payload);
    // Detect outside allowed window policy error
    const errObj = first && first.body && first.body.error;
    const isWindowError = first.ok === false && first.status === 400 && errObj && errObj.code === 10 && errObj.error_subcode === 2018278;
    if (isWindowError) {
      // Retry with message tag ACCOUNT_UPDATE (appropriate for login / account security notifications)
      const tagged = { recipient: { id: String(psid) }, message: baseMsg, messaging_type: 'MESSAGE_TAG', tag: 'ACCOUNT_UPDATE' };
      const second = await post(tagged);
      second.windowRetry = true;
      second.original = first;
      return second;
    }
    return first;
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Explicit helper for two-factor messages using ACCOUNT_UPDATE tag directly.
async function sendTwoFactor(psid, code) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, message: 'Missing FB token' };
  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const text = `Your login code is: ${code}\nIt will expire in 1 minute.`;
  const payload = { recipient: { id: String(psid) }, message: { text }, messaging_type: 'MESSAGE_TAG', tag: 'ACCOUNT_UPDATE' };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let body = null; try { body = await res.json(); } catch (e) { body = null; }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Notify a single customer (order) about status change using their stored messenger_psid
async function notifyCustomer(order) {
  try {
    if (!order) return { ok: false, message: 'No order provided' };
    const psid = order.messenger_psid || order.customer_psid || order.messengerPsid || null;
    if (!psid) return { ok: false, message: 'No customer PSID on order' };
    const status = String(order.status || 'Updated');
    const id = String(order.order_id || order.orderId || '');
    const total = order.total_fee != null ? `₱${Number(order.total_fee).toLocaleString()}` : '';
    const base = process.env.SITE_BASE_URL || '';
    const trackUrl = base ? `${base.replace(/\/$/, '')}/?orderId=${encodeURIComponent(id)}` : undefined;

    // If order is delivered, send a cute thank-you message
    if (String(status || '').toLowerCase() === 'delivered') {
      const reviewLink = base ? `${base.replace(/\/$/, '')}/reviews.html` : '/reviews.html';
      const lines = [];
      lines.push('⋆˚✿˖° 𝐎𝐫𝐝𝗲𝐫 𝐔𝗽𝗱𝗮𝘁𝗲 ⋆˚✿˖°');
      lines.push(`Hi ${order.name || ''}, Your order has been delivered!`);
      lines.push('');
      lines.push(`Order ID: ${id}`);
      if (total) lines.push(`Total: ${total}`);
      lines.push('');
      lines.push('Thank you so much for choosing Chammy Florals — your support means the world to us!');
      lines.push('If you loved it, we\'d be so grateful for a quick review — it helps our small shop grow');
      lines.push(`Review: ${reviewLink}`);
      const textDelivered = lines.join('\n');
      return await sendOrderUpdate(psid, textDelivered);
    }

    // Generic status update (use POST_PURCHASE_UPDATE tag to allow outside 24h window)
    const lines = [];
    lines.push(`⋆˚✿˖° 𝐎𝐫𝐝𝗲𝗿 𝐔𝗽𝗱𝗮𝘁𝗲 ⋆˚✿˖°`);
    lines.push(`Hi ${order.name || ''},`);
    lines.push('');
    lines.push(`Order ID: ${id}`);
    lines.push(`Status: ${status}`);
    if (total) lines.push(`Total: ${total}`);
    lines.push('');
    if (trackUrl) lines.push(`Track your order: ${trackUrl}`);
    const text = lines.join('\n');
    return await sendOrderUpdate(psid, text);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// Tagged order update helper (POST_PURCHASE_UPDATE)
async function sendOrderUpdate(psid, text) {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, message: 'Missing FB token' };
  const url = `https://graph.facebook.com/v17.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const payload = { recipient: { id: String(psid) }, message: { text }, messaging_type: 'MESSAGE_TAG', tag: 'POST_PURCHASE_UPDATE' };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    let body = null; try { body = await res.json(); } catch (e) { body = null; }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = { notifyAdmins, sendToPsid, notifyCustomer, sendTwoFactor, sendOrderUpdate };
