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

async function registerAdminCommands(chatId) {
  if (!chatId) return;
  try {
    // Register admin commands specifically for this admin chat ID
    await fetch(`${API}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Start the tracking bot' },
          { command: 'track', description: 'Track order status' },
          { command: 'list', description: 'List all active orders' },
          { command: 'status', description: 'Directly update an order status' }
        ],
        scope: { type: 'chat', chat_id: String(chatId) }
      })
    });
  } catch (err) {
    console.error('Failed to set admin commands menu:', err);
  }
}

async function isAdmin(chatId) {
  if (!chatId) return false;
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('tgid', String(chatId))
      .eq('status', 'Approved')
      .maybeSingle();
    if (!error && data && data.id) {
      registerAdminCommands(chatId);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
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

async function sendActiveOrdersList(chatId, editMessageId = null) {
  try {
    const { data: std } = await supabase
      .from('orders')
      .select('order_id, status, flower_type, name')
      .order('created_at', { ascending: false });

    const { data: cust } = await supabase
      .from('custom_orders')
      .select('order_id, status, flower_type, name')
      .order('created_at', { ascending: false });

    const active = [];
    const filterOut = ['delivered', 'completed', 'received', 'cancelled'];

    if (std) {
      std.forEach(o => {
        const status = String(o.status || 'Pending').toLowerCase().trim();
        if (!filterOut.includes(status)) {
          active.push({ table: 'orders', ...o });
        }
      });
    }

    if (cust) {
      cust.forEach(o => {
        const status = String(o.status || 'Pending').toLowerCase().trim();
        if (!filterOut.includes(status)) {
          active.push({ table: 'custom_orders', ...o });
        }
      });
    }

    if (active.length === 0) {
      const msg = "No active (undelivered) orders found.";
      if (editMessageId) {
        await editMessageText(chatId, editMessageId, msg);
      } else {
        await sendMessage(chatId, msg);
      }
      return;
    }

    const keyboard = [];
    active.forEach(o => {
      const label = o.flower_type || (o.table === 'custom_orders' ? 'Custom Bouquet' : 'Order');
      const emoji = o.status === 'Processing' ? '' : (o.status === 'To Receive' ? '' : '');
      keyboard.push([
        {
          text: `${emoji} #${o.order_id} [${o.name || 'No Name'}] - ${label} (${o.status || 'Pending'})`,
          callback_data: `select_status:${o.table}:${o.order_id}`
        }
      ]);
    });

    const msg = ` <b>Active Orders (${active.length}):</b>\nSelect an order to change its status:`;
    const opts = {
      reply_markup: JSON.stringify({ inline_keyboard: keyboard })
    };

    if (editMessageId) {
      await editMessageText(chatId, editMessageId, msg, opts);
    } else {
      await sendMessage(chatId, msg, opts);
    }
  } catch (err) {
    console.error('sendActiveOrdersList error:', err);
    if (chatId) {
      await sendMessage(chatId, "Failed to retrieve active orders list.");
    }
  }
}

async function handleTextMessage(chatId, text) {
  const trimmed = String(text || '').trim();

  if (trimmed === '/start' || trimmed === '/help') {
    return sendMessage(chatId, WELCOME);
  }

  if (trimmed === '/list') {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      return sendMessage(chatId, "Unauthorized. You must be an approved administrator to use this command.");
    }
    return sendActiveOrdersList(chatId);
  }

  if (trimmed === '/status') {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      return sendMessage(chatId, "Unauthorized. You must be an approved administrator to use this command.");
    }
    return sendMessage(chatId, "Usage: <code>/status ORDERID</code>");
  }

  // /status <id> command
  const statusMatch = trimmed.match(/^\/status\s+(.+)$/);
  if (statusMatch) {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      return sendMessage(chatId, "Unauthorized. You must be an approved administrator to use this command.");
    }
    const orderId = statusMatch[1].trim();
    const found = await findOrder(orderId);
    if (!found) {
      return sendMessage(chatId, `Could not find order <code>${escapeHtml(orderId)}</code>.`);
    }
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Pending', callback_data: `status:${found.table}:${found.data.order_id}:Pending` },
          { text: 'Processing', callback_data: `status:${found.table}:${found.data.order_id}:Processing` }
        ],
        [
          { text: 'To Receive', callback_data: `status:${found.table}:${found.data.order_id}:To Receive` },
          { text: 'Delivered', callback_data: `status:${found.table}:${found.data.order_id}:Delivered` }
        ]
      ]
    };
    return sendMessage(chatId, `Select new status for Order <b>#${escapeHtml(found.data.order_id)}</b>:`, {
      reply_markup: JSON.stringify(replyMarkup)
    });
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

  if (data.startsWith('status:')) {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      await answerCallback(callback.id, 'Unauthorized.');
      return;
    }
    const parts = data.split(':');
    const table = parts[1];
    const newStatus = parts[parts.length - 1];
    const orderId = parts.slice(2, parts.length - 1).join(':');

    await answerCallback(callback.id, `Updating to ${newStatus}…`);
    try {
      // 1. Fetch previous status and details (including email) first
      const { data: existing, error: fetchErr } = await supabase
        .from(table)
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (fetchErr || !existing) throw fetchErr || new Error('Order not found');

      const previousStatus = existing.status || 'Pending';

      // 2. Update status in the database
      const { data: updatedRows, error } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq('order_id', orderId)
        .select();

      if (error) throw error;

      if (chatId && messageId) {
        await editMessageText(chatId, messageId, `Order <b>#${escapeHtml(orderId)}</b> status updated to <b>${escapeHtml(newStatus)}</b>.`, {
          reply_markup: JSON.stringify({
            inline_keyboard: [[{ text: 'Back to Orders', callback_data: 'list_active_orders' }]]
          })
        });
      }

      // 3. Proactively notify the customer about status change
      await notifyOrderStatusChange(orderId);

      // 4. Send email notification (best-effort)
      const updated = (updatedRows && updatedRows[0]) || null;
      if (updated && previousStatus !== updated.status && updated.email) {
        try {
          const mailer = require('./mailer');
          const emailTemplates = require('./email-templates');
          if (String(updated.status || '').toLowerCase() === 'delivered') {
            const mail = emailTemplates.deliveredTemplate(updated);
            await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
            console.log('Delivered email sent successfully via Telegram bot status update');
          } else {
            const mail = emailTemplates.statusUpdateTemplate(updated, previousStatus);
            await mailer.sendMail({ to: updated.email, subject: mail.subject, html: mail.html });
            console.log('Status update email sent successfully via Telegram bot status update');
          }
        } catch (emailErr) {
          console.error('Failed to send status update email from Telegram bot:', emailErr.message || emailErr);
        }
      }
    } catch (err) {
      console.error('Callback status update error:', err);
      if (chatId) await sendMessage(chatId, `Failed to update status for order <code>${escapeHtml(orderId)}</code>.`);
    }
    return;
  }

  if (data.startsWith('select_status:')) {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      await answerCallback(callback.id, 'Unauthorized.');
      return;
    }
    const parts = data.split(':');
    const table = parts[1];
    const orderId = parts.slice(2).join(':');

    await answerCallback(callback.id, 'Loading status options…');

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: 'Pending', callback_data: `status:${table}:${orderId}:Pending` },
          { text: 'Processing', callback_data: `status:${table}:${orderId}:Processing` }
        ],
        [
          { text: 'To Receive', callback_data: `status:${table}:${orderId}:To Receive` },
          { text: 'Delivered', callback_data: `status:${table}:${orderId}:Delivered` }
        ],
        [
          { text: 'Back to Orders', callback_data: 'list_active_orders' }
        ]
      ]
    };

    if (chatId && messageId) {
      await editMessageText(chatId, messageId, `Select new status for Order <b>#${escapeHtml(orderId)}</b>:`, {
        reply_markup: JSON.stringify(replyMarkup)
      });
    }
    return;
  }

  if (data === 'list_active_orders') {
    const userIsAdmin = await isAdmin(chatId);
    if (!userIsAdmin) {
      await answerCallback(callback.id, 'Unauthorized.');
      return;
    }
    await answerCallback(callback.id, 'Loading list…');
    if (chatId && messageId) {
      await sendActiveOrdersList(chatId, messageId);
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

  // Set default commands for regular users
  try {
    await fetch(`${API}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Start the tracking bot' },
          { command: 'track', description: 'Track your order status' }
        ],
        scope: { type: 'default' }
      })
    });
  } catch (e) {
    console.warn('Failed to register default commands menu:', e);
  }

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
