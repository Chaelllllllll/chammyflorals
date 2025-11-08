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

          const state = sessions.get(sender);
          if (state === 'awaitingOrderId') {
            sessions.delete(sender);
            console.log(`Messenger: received order id from sender=${sender} id=${trimmed}`);
            await handleTrackRequest(sender, trimmed);
            continue;
          }

          // Quick trigger words
          if (/^track\b/i.test(trimmed) || /^status\b/i.test(trimmed)) {
            sessions.set(sender, 'awaitingOrderId');
            await sendMessage(sender, 'Sure — please send me your Order ID (e.g. ABC12345).');
            continue;
          }

          // Default help message
          await sendMessage(sender, 'Hi — to track an order, type "Track" or use the Track Order button.');
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

// Send a text message via the Facebook Send API
async function sendMessage(psid, text) {
  if (!PAGE_TOKEN) {
    console.warn('FB_PAGE_ACCESS_TOKEN not configured; skipping sendMessage');
    return null;
  }
  const payload = {
    recipient: { id: psid },
    message: { text },
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

    const lines = [];
    lines.push(`Order ${data.order_id}`);
    if (data.status) lines.push(`Status: ${data.status}`);
    if (data.name) lines.push(`Name: ${data.name}`);
    if (data.flower_type) lines.push(`Items: ${data.flower_type} x${data.quantity || 1}`);
    if (typeof data.total_fee !== 'undefined') lines.push(`Total: ₱${data.total_fee}`);
    if (data.created_at) lines.push(`Ordered: ${new Date(data.created_at).toLocaleString()}`);

    const reply = lines.join('\n');
    const sendRes = await sendMessage(psid, reply);
    try { console.log('Messenger: sendMessage response:', JSON.stringify(sendRes).slice(0,500)); } catch (e) {}
  } catch (err) {
    console.error('handleTrackRequest error:', err && err.message ? err.message : err);
    await sendMessage(psid, 'Sorry, something went wrong while fetching your order. Please try again later.');
  }
}

module.exports = router;
