const fetch = global.fetch || require('node-fetch');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTelegramMessage(order) {
  const id = String(order.order_id || order.orderId || '');
  const name = String(order.name || '');
  const fb = String(order.fb_link || order.facebook || '');
  
  let itemsList = [];
  if (Array.isArray(order.items) && order.items.length) {
    itemsList = order.items.map(i => {
      const label = String(i.flower_type || i.name || i.code || 'Item');
      const q = Number(i.quantity || i.qty || 1) || 1;
      return `${label} x${q}`;
    });
  } else if (order.flower_type) {
    itemsList.push(order.flower_type);
  }

  const total = order.total_fee || order.total || '0';
  const status = order.status || 'Pending';
  const totalQty = (Array.isArray(order.items) && order.items.length) 
    ? order.items.reduce((s,i)=>s+(Number(i.quantity||i.qty||1)||0),0) 
    : (Number(order.quantity) || 1);
  const voucherCode = order.voucher_code || '';
  const voucherDiscount = Number(order.voucher_discount) || 0;
  
  let msg = `<b>New Order Received!</b>\n`;
  msg += `─────────────────────\n`;
  msg += `<b>Order ID:</b> <code>${escapeHtml(id)}</code>\n`;
  if (name) msg += `<b>Customer:</b> ${escapeHtml(name)}\n`;
  if (fb) msg += `<b>Facebook:</b> <a href="${escapeHtml(fb)}">Link</a>\n`;
  if (itemsList.length) msg += `<b>Items:</b> ${escapeHtml(itemsList.join('; '))}\n`;
  msg += `<b>Quantity:</b> ${totalQty}\n`;
  msg += `<b>Status:</b> ${status}\n`;
  msg += `─────────────────────\n`;
  if (voucherCode) {
    msg += `<b>Voucher:</b> <code>${escapeHtml(voucherCode)}</code>\n`;
    if (voucherDiscount > 0) msg += `<b>Discount:</b> -₱${voucherDiscount.toLocaleString()}\n`;
  }
  msg += `<b>Total:</b> <b>₱${Number(total).toLocaleString()}</b>`;
  return msg;
}

async function notifyTelegram(order) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('Telegram notifications skipped: TELEGRAM_BOT_TOKEN not configured');
    return { ok: false, message: 'Missing TELEGRAM_BOT_TOKEN' };
  }

  // Load chat IDs to notify
  const chatIds = new Set();
  
  // 1. Add global config chat ID if configured
  if (process.env.TELEGRAM_CHAT_ID) {
    chatIds.add(String(process.env.TELEGRAM_CHAT_ID).trim());
  }

  // 2. Fetch specific admin chat IDs from database (admins table approved rows with tgid)
  try {
    const supabase = require('../config/supabase');
    if (supabase) {
      const { data, error } = await supabase.from('admins').select('tgid,status').limit(100);
      if (!error && Array.isArray(data)) {
        (data || []).forEach(r => {
          if (r && r.tgid && String(r.status || '').toLowerCase() === 'approved') {
            const chatVal = String(r.tgid).trim();
            if (chatVal) chatIds.add(chatVal);
          }
        });
      }
    }
  } catch (dbErr) {
    console.warn('notifyTelegram: failed to read admin Telegram Chat IDs from Supabase', dbErr);
  }

  if (chatIds.size === 0) {
    console.warn('Telegram notifications skipped: No active Telegram Chat IDs configured in environment or database');
    return { ok: false, message: 'No chat IDs' };
  }

  try {
    let text = '';
    if (typeof order === 'string') {
      text = order;
    } else {
      text = buildTelegramMessage(order);
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const results = [];

    for (const chatId of chatIds) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
        
        const body = await res.json();
        results.push({ chatId, ok: res.ok, body });
        if (!res.ok) {
          console.error(`Telegram sendMessage API error for chat ${chatId}:`, body);
        }
      } catch (sendErr) {
        results.push({ chatId, ok: false, error: sendErr.message });
      }
    }
    
    return { ok: true, results };
  } catch (err) {
    console.error('Telegram notification error:', err);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  notifyTelegram
};
