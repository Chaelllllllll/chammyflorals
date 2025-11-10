const fetch = global.fetch || require('node-fetch');

function safeString(v) {
  try { return (v == null) ? '' : String(v); } catch (e) { return '' }
}

function buildMessageText(order) {
  const id = safeString(order.order_id || order.orderId || '');
  const name = safeString(order.name || '');
  const fb = safeString(process.env.SITE_BASE_URL || order.fb_link || order.facebook || '');
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
