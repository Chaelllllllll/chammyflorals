// Order-tracking Telegram bot (long-polling, no external bot library).
// Mirrors the dashboard's status timeline (getOrderProgress in public/js/dashboard.js)
// and the /track/:orderId lookup in src/routes/api.js, plus a custom_orders fallback.

const fetch = global.fetch || require('node-fetch');
const supabase = require('../config/supabase');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

// Status → step index, kept in sync with dashboard.js:545-559
const STATUS_INDEX = {
  'pending': 0,
  'confirmed': 0,
  'order placed': 0,
  'processing': 1,
  'preparing': 1,
  'in progress': 1,
  'out for delivery': 2,
  'to receive': 2,
  'to deliver': 2,
  'shipping': 2,
  'shipped': 2,
  'in transit': 2,
  'delivered': 3,
  'completed': 3,
  'received': 3
};

const STEPS = [
  { name: 'Order Placed', emoji: '', desc: 'Your order has been received' },
  { name: 'Processing', emoji: '', desc: 'Preparing your order' },
  { name: 'Out for Delivery', emoji: '', desc: 'On the way to you' },
  { name: 'Delivered', emoji: '', desc: 'Order completed' }
];

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function statusStepIndex(status) {
  const normalized = String(status || 'pending').toLowerCase().trim();
  return STATUS_INDEX[normalized] !== undefined ? STATUS_INDEX[normalized] : 0;
}

function formatTotal(value) {
  const num = Number(value);
  return isNaN(num) ? '₱0' : `₱${num.toLocaleString()}`;
}

function buildTimeline(status) {
  const currentIndex = statusStepIndex(status);
  const lines = STEPS.map((step, index) => {
    const marker = index < currentIndex ? '✅' : (index === currentIndex ? '🟢' : '⚪');
    const label = index < currentIndex ? `${step.name}` : step.name;
    return `${marker} <b>${label}</b>\n   ${step.desc}`;
  });
  return lines.join('\n');
}

// Mirrors /track/:orderId lookup: exact → uppercase → ILIKE. Also checks custom_orders.
async function findOrder(rawId) {
  const idRaw = String(rawId || '').trim();
  if (!idRaw) return null;

  const lookupTables = ['orders', 'custom_orders'];
  for (const table of lookupTables) {
    try {
      const exact = await supabase.from(table).select('*').eq('order_id', idRaw).single();
      if (!exact.error && exact.data) return { table, data: exact.data };
    } catch (e) { /* continue */ }

    try {
      const upper = await supabase.from(table).select('*').eq('order_id', String(idRaw).toUpperCase()).single();
      if (!upper.error && upper.data) return { table, data: upper.data };
    } catch (e) { /* continue */ }

    try {
      const fallback = await supabase.from(table).select('*').ilike('order_id', idRaw).limit(1);
      if (fallback && fallback.data && fallback.data.length) return { table, data: fallback.data[0] };
    } catch (e) { /* continue */ }
  }
  return null;
}

function describeOrder(found) {
  const { table, data } = found;
  const isCustom = table === 'custom_orders';

  let items = '';
  if (isCustom) {
    const stems = (data.stems || []).map(s => `${s.name} x${s.quantity}`);
    const fillers = (data.fillers || []).map(f => `${f.name} x${f.quantity}`);
    const wrapping = data.wrapping ? `, ${data.wrapping} wrapping` : '';
    const parts = [...stems, ...fillers];
    items = parts.length ? parts.join('; ') + wrapping : (data.flower_type || 'Custom arrangement');
  } else if (data.flower_type) {
    items = `${data.flower_type}${data.quantity ? ` x${data.quantity}` : ''}`;
  } else {
    items = 'Order';
  }

  const details = [];
  if (data.name) details.push(`Customer: <b>${escapeHtml(data.name)}</b>`);
  if (data.email) details.push(`Email: <code>${escapeHtml(data.email)}</code>`);
  if (isCustom && data.expected_delivery_date) details.push(`Delivery: <b>${escapeHtml(data.expected_delivery_date)}</b>`);
  if (isCustom && data.rush && String(data.rush).toLowerCase() === 'yes') details.push(`🚀 <b>Rush order</b>`);

  return { isCustom, items, details, total: formatTotal(data.total_fee) };
}

function buildTrackMessage(orderId, found, showTimestamp = false) {
  const { data } = found;
  const { isCustom, items, details, total } = describeOrder(found);

  let msg = `<b>Order #${escapeHtml(data.order_id || orderId)}</b>\n`;
  msg += `─────────────────────\n`;
  if (isCustom) msg += `Type: <b>Custom arrangement</b>\n`;
  msg += `Items: ${escapeHtml(items)}\n`;
  if (details.length) msg += details.join('\n') + '\n';
  if (data.created_at) msg += `Placed: ${escapeHtml(new Date(data.created_at).toLocaleString())}\n`;
  msg += `Total: <b>${total}</b>\n`;
  msg += `Status: <b>${escapeHtml(data.status || 'Pending')}</b>\n`;
  msg += `─────────────────────\n`;
  msg += buildTimeline(data.status || 'pending');
  if (showTimestamp) msg += `\n\n_Updated ${new Date().toLocaleString()}`;
  return msg;
}

// Persist the chat_id on the linked customer so status changes can be pushed proactively.
// Only works for orders whose customer_id is set (auth'd checkout). Guest/admin orders are skipped.
async function saveChatId(orderId, chatId) {
  if (!orderId || !chatId) return;
  const found = await findOrder(orderId);
  const customerId = found && found.data && found.data.customer_id;
  if (!customerId) return;
  try {
    await supabase
      .from('customers')
      .update({ telegram_chat_id: String(chatId) })
      .eq('id', customerId);
  } catch (e) {
    console.error('saveChatId error:', e.message);
  }
}

async function sendMessage(chatId, text, opts = {}) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...opts })
  });
  const body = await res.json();
  if (!res.ok) console.error('Telegram sendMessage error:', body);
  return body;
}

async function answerCallback(callbackQueryId, text) {
  try {
    await fetch(`${API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch (e) { /* ignore */ }
}

async function editMessageText(chatId, messageId, text, opts = {}) {
  try {
    await fetch(`${API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', ...opts })
    });
  } catch (e) { /* ignore */ }
}

const WELCOME = `<b>Chammy Florals Order Tracker</b>

Send your order number to track its status anytime:
/track <code>ORDERID</code>

Or tap <i>Track Order</i> on your order confirmation and this chat opens automatically.`;

async function handleTextMessage(chatId, text) {
  const trimmed = String(text || '').trim();

  if (trimmed === '/start' || trimmed === '/help') {
    return sendMessage(chatId, WELCOME);
  }

  // Deep link: /start <payload> where payload is the order id
  const startMatch = trimmed.match(/^\/start\s+(.+)$/);
  if (startMatch) {
    const candidate = decodeURIComponent(startMatch[1]).trim();
    const found = await findOrder(candidate);
    if (!found) {
      return sendMessage(chatId, `Could not find order <code>${escapeHtml(candidate)}</code>.\n\nPlease double-check the order number and try again.`);
    }
    await saveChatId(found.data.order_id, chatId);
    return sendMessage(chatId, buildTrackMessage(candidate, found), {
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: 'Refresh Status', callback_data: `track:${found.data.order_id}` }]]
      })
    });
  }

  // /track <id> command
  const trackMatch = trimmed.match(/^\/track\s+(.+)$/);
  if (trackMatch) {
    const orderId = trackMatch[1].trim();
    const found = await findOrder(orderId);
    if (!found) {
      return sendMessage(chatId, `Could not find order <code>${escapeHtml(orderId)}</code>.\n\nPlease check the order number and try again.`);
    }
    await saveChatId(found.data.order_id, chatId);
    return sendMessage(chatId, buildTrackMessage(orderId, found), {
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: 'Refresh Status', callback_data: `track:${found.data.order_id}` }]]
      })
    });
  }

  // Bare message that looks like an order id: try to track it
  if (/^[A-Z0-9]{8}$/i.test(trimmed)) {
    const found = await findOrder(trimmed);
    if (found) {
      await saveChatId(found.data.order_id, chatId);
      return sendMessage(chatId, buildTrackMessage(trimmed, found), {
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: 'Refresh Status', callback_data: `track:${found.data.order_id}` }]]
        })
      });
    }
  }

  return sendMessage(chatId, `I didn't understand that.\n\n${WELCOME}`);
}

async function handleCallback(callback) {
  const data = String(callback.data || '');
  const chatId = callback.message && callback.message.chat ? callback.message.chat.id : null;
  const messageId = callback.message ? callback.message.message_id : null;

  if (data.startsWith('track:')) {
    const orderId = data.replace('track:', '');
    await answerCallback(callback.id, 'Refreshing…');
    const found = await findOrder(orderId);
    if (!found) {
      if (chatId) await sendMessage(chatId, `Order <code>${escapeHtml(orderId)}</code> could not be found anymore.`);
      return;
    }
    if (chatId) await saveChatId(found.data.order_id, chatId);
    if (chatId && messageId) {
      await editMessageText(chatId, messageId, buildTrackMessage(orderId, found, true), {
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: 'Refresh Status', callback_data: `track:${found.data.order_id}` }]]
        })
      });
    }
    return;
  }

  if (chatId) await answerCallback(callback.id, 'Unknown action');
}

async function handleUpdate(update) {
  if (update.message && update.message.text) {
    await handleTextMessage(update.message.chat.id, update.message.text);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
}

let polling = false;
let offset = 0;

// Long-polling loop. Safe to call multiple times; only one loop runs.
async function startOrderBot() {
  if (polling) return;
  if (!TOKEN) {
    console.warn('Order bot not started: TELEGRAM_BOT_TOKEN not configured');
    return;
  }
  polling = true;
  console.log('Order-tracking bot started (long-polling).');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=50&offset=${offset}`);
      const body = await res.json();
      if (!body.ok) {
        console.error('Telegram getUpdates error:', body);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      for (const update of body.result || []) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (e) {
          console.error('Order bot update handler error:', e);
        }
      }
    } catch (e) {
      console.error('Order bot polling error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Push a proactive status update to the chat subscribed to this order (via the linked customer).
async function notifyOrderStatusChange(orderId) {
  if (!orderId) return;
  const found = await findOrder(orderId);
  const customerId = found && found.data && found.data.customer_id;
  if (!customerId) return;

  let chatId = null;
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('telegram_chat_id')
      .eq('id', customerId)
      .maybeSingle();
    if (!error && data && data.telegram_chat_id) chatId = data.telegram_chat_id;
  } catch (e) {
    console.error('notifyOrderStatusChange lookup error:', e.message);
    return;
  }
  if (!chatId) return;

  const opts = {
    reply_markup: JSON.stringify({
      inline_keyboard: [[{ text: 'Refresh Status', callback_data: `track:${found.data.order_id}` }]]
    })
  };
  try {
    await sendMessage(chatId, buildTrackMessage(orderId, found, true), opts);
  } catch (e) {
    console.error('notifyOrderStatusChange send error:', e.message);
  }

  // When the order reaches the delivered step, prompt the customer to leave a review
  // via an inline URL button to the reviews page, pre-filled with the order id.
  if (statusStepIndex(found.data.status) === 3) {
    const base = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim())
      ? process.env.FRONTEND_URL.trim()
      : 'https://chammyflorals.vercel.app';
    const reviewUrl = `${base.replace(/\/$/, '')}/reviews.html?orderId=${encodeURIComponent(found.data.order_id)}`;
    const reviewMsg = `<b>Order #${escapeHtml(found.data.order_id)}</b> has been delivered!\n\nWe would love to hear about your experience. Tap the button below to leave a review.`;
    const reviewOpts = {
      reply_markup: JSON.stringify({
        inline_keyboard: [[{ text: 'Leave a Review', url: reviewUrl }]]
      })
    };
    try {
      await sendMessage(chatId, reviewMsg, reviewOpts);
    } catch (e) {
      console.error('notifyOrderStatusChange review message error:', e.message);
    }
  }
}

module.exports = { startOrderBot, findOrder, saveChatId, notifyOrderStatusChange };
