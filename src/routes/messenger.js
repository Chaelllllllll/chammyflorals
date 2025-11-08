const express = require('express');
const fetch = global.fetch || require('node-fetch');
const router = express.Router();

const PAGE_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_PAGE_TOKEN || '';
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'verify_token_example';
const APP_SECRET = process.env.FB_APP_SECRET || '';

// Simple in-memory session state for conversational flows (replace with Redis in prod)
const sessions = new Map(); // key: senderId -> value: 'awaitingOrderId' | null

// Webhook verification for Facebook
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Messenger webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Receive webhook events (messages, postbacks)
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const body = req.body;
    try { console.log('Messenger webhook received keys:', Object.keys(body).slice(0,10)); } catch (e) {}
    if (body.object === 'page' || body.object === 'instagram') {
      for (const entry of body.entry || []) {
        const messagingEvents = entry.messaging || entry.messages || [];
        for (const event of messagingEvents) {
          const sender = (event.sender && (event.sender.id || event.sender.user_id)) || (event.from && event.from.id);
          if (!sender) continue;

          // Postback (e.g., button press)
          if (event.postback && event.postback.payload) {
            const payload = event.postback.payload;
            if (payload === 'TRACK_ORDER') {
              sessions.set(sender, 'awaitingOrderId');
              await sendMessage(sender, 'Please enter your Order ID and I will fetch the status for you.');
            }
            continue;
          }

          // Message text
          const text = (event.message && (event.message.text || event.message.body)) || (event.text && event.text.body) || '';
          if (!text) continue;
          const trimmed = String(text).trim();

          // detect quick_reply payload/title if present
          const quickPayload = event.message && event.message.quick_reply && event.message.quick_reply.payload;

          const state = sessions.get(sender);
          if (state === 'awaitingOrderId') {
            // Robustly treat quick-reply taps (or the 'Enter Order ID' text) as prompts
            // (some clients/platforms may omit payloads or vary the text)
            if (quickPayload === 'TRACK_ORDER_PROMPT' || /^enter order id\b/i.test(trimmed)) {
              await sendMessage(sender, 'Please type your Order ID (for example: ABC12345) and I will look it up.');
              // keep session waiting
              continue;
            }
            // otherwise treat this message as the typed order id
            sessions.delete(sender);
            console.log(`Messenger: received order id from sender=${sender} id=${trimmed}`);
            await handleTrackRequest(sender, trimmed);
            continue;
          }

          // Quick trigger words -> send a quick-reply prompt and set session state
          if (/^track\b/i.test(trimmed) || /^status\b/i.test(trimmed)) {
            sessions.set(sender, 'awaitingOrderId');
            // send a neutral prompt without a quick-reply button to avoid clients sending the
            // quick-reply title as the message text when tapped
            await sendMessage(sender, 'Sure — please type your Order ID (e.g. ABC12345) and I will look it up.');
            continue;
          }
        }
      }
      return res.sendStatus(200);
    }
    return res.sendStatus(404);
  } catch (err) {
    console.error('Messenger webhook error:', err && err.message ? err.message : err);
    return res.sendStatus(500);
  }
});

// Send a message via the Facebook Send API. `message` can be a string or a message object
async function sendMessage(psid, message) {
  if (!PAGE_TOKEN) {
    console.warn('FB_PAGE_ACCESS_TOKEN not configured; skipping sendMessage');
    return null;
  }
  const msgPayload = typeof message === 'string' ? { text: message } : message;
  const payload = {
    recipient: { id: psid },
    message: msgPayload,
  };
  try {
    const resp = await fetch(`https://graph.facebook.com/v16.0/me/messages?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) console.warn('Send API error', json);
    return json;
  } catch (err) {
    console.error('sendMessage error:', err && err.message ? err.message : err);
    return null;
  }
}

// Call Supabase directly to fetch order and reply with formatted info
async function handleTrackRequest(psid, orderId) {
  try {
    // Query Supabase directly to avoid calling the public HTTP endpoint (avoids host-level 401s)
    const supabase = require('../config/supabase');
    console.log('Messenger: querying Supabase for orderId=', orderId);
    const { data, error } = await supabase.from('orders').select('*').eq('order_id', String(orderId)).single();
    if (error || !data) {
      console.log('Messenger: supabase lookup no data/error:', error ? error.message || error : 'no data');
      return sendMessage(psid, `Sorry, I couldn't find an order with ID ${orderId}.`);
    }

  // Build a concise, professional order summary for messaging
  const parts = [];
  parts.push('Order Status');
  parts.push('------------------------------');
  parts.push(`Order ID: ${data.order_id}`);
  if (data.status) {
    // Map status to a badge-like emoji + label (Bootstrap color equivalence shown in parentheses)
    const st = String(data.status || '').trim();
    const key = st.toLowerCase().replace(/\s+/g, '');
    const statusMap = {
      pending: { emoji: '⚪', note: 'secondary' },
      processing: { emoji: '🟡', note: 'warning' },
      toreceive: { emoji: '🔵', note: 'info' },
      'to receive': { emoji: '🔵', note: 'info' },
      delivered: { emoji: '🟢', note: 'success' },
      cancelled: { emoji: '🔴', note: 'danger' },
      canceled: { emoji: '🔴', note: 'danger' }
    };
    const mapped = statusMap[key] || { emoji: 'ℹ️', note: '' };
    parts.push(`Status: ${mapped.emoji} ${st}${mapped.note ? ` (${mapped.note})` : ''}`);
  }
  if (data.name) parts.push(`Customer: ${data.name}`);
  if (data.flower_type) parts.push(`Items: ${data.flower_type} × ${data.quantity || 1}`);
  if (typeof data.total_fee !== 'undefined') parts.push(`Total: ₱${Number(data.total_fee).toLocaleString()}`);
  const reply = parts.join('\n');

  // Build a Button Template with a View button linking to the public track page for this order
  try {
  const base = process.env.SITE_BASE_URL || 'https://your-site.example';
  // Redirect to homepage and open the track modal with orderId param so the site auto-tracks
  const trackUrl = `${base.replace(/\/$/, '')}/?orderId=${encodeURIComponent(String(data.order_id))}`;
    const messageObj = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: reply,
          buttons: [
            { type: 'web_url', url: trackUrl, title: 'View', webview_height_ratio: 'full' }
          ]
        }
      }
    };
    const sendRes = await sendMessage(psid, messageObj);
    try { console.log('Messenger: sendMessage response:', JSON.stringify(sendRes).slice(0,500)); } catch (e) {}
  } catch (btnErr) {
    // fallback to plain text if something goes wrong
    const sendRes = await sendMessage(psid, reply);
    try { console.log('Messenger: sendMessage fallback response:', JSON.stringify(sendRes).slice(0,500)); } catch (e) {}
  }
  } catch (err) {
    console.error('handleTrackRequest error:', err && err.message ? err.message : err);
    await sendMessage(psid, 'Sorry, something went wrong while fetching your order. Please try again later.');
  }
}

// Helper: persistent menu payload for FB Messenger
function persistentMenuPayload() {
  return {
    persistent_menu: [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          {
            type: 'postback',
            title: 'Track Order',
            payload: 'TRACK_ORDER'
          },
          {
            type: 'web_url',
            title: 'View Catalog',
            url: process.env.SITE_BASE_URL || 'https://your-site.example/',
            webview_height_ratio: 'full'
          }
        ]
      }
    ]
  };
}

// GET returns the payload/instructions. POST attempts to set it using PAGE_TOKEN.
router.get('/setup-persistent-menu', (req, res) => {
  return res.json({
    note: 'This endpoint shows the persistent menu payload. To install it, POST to this URL with ?token=ADMIN_SETUP_TOKEN (env) or run the Graph API call manually as documented below.',
    payload: persistentMenuPayload(),
    manualCurl: `curl -X POST "https://graph.facebook.com/v16.0/me/messenger_profile?access_token=${PAGE_TOKEN}" -H 'Content-Type: application/json' -d '${JSON.stringify(persistentMenuPayload())}'`
  });
});

router.post('/setup-persistent-menu', express.json(), async (req, res) => {
  const adminToken = process.env.ADMIN_SETUP_TOKEN || '';
  const provided = (req.query.token || req.body.token || '');
  if (adminToken && adminToken !== provided) {
    return res.status(403).json({ error: 'Invalid setup token' });
  }
  if (!PAGE_TOKEN) {
    return res.status(500).json({ error: 'FB_PAGE_ACCESS_TOKEN not configured. See README for instructions.' });
  }
  try {
    const payload = persistentMenuPayload();
    const resp = await fetch(`https://graph.facebook.com/v16.0/me/messenger_profile?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) return res.status(resp.status).json({ error: 'Graph API error', details: json });
    return res.json({ ok: true, result: json });
  } catch (err) {
    console.error('setup-persistent-menu error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to call Graph API' });
  }
});

// GET current persistent_menu from Graph API for debugging/verification
router.get('/check-persistent-menu', async (req, res) => {
  if (!PAGE_TOKEN) return res.status(500).json({ error: 'FB_PAGE_ACCESS_TOKEN not configured' });
  try {
    const resp = await fetch(`https://graph.facebook.com/v16.0/me/messenger_profile?fields=persistent_menu&access_token=${encodeURIComponent(PAGE_TOKEN)}`);
    const json = await resp.json().catch(() => null);
    return res.json({ ok: resp.ok, status: resp.status, result: json });
  } catch (err) {
    console.error('check-persistent-menu error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Failed to query Graph API' });
  }
});

module.exports = router;
