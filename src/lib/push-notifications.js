/*
  Server push helper using `node-pushnotifications` for Web Push.
  This replaces previous web-push / Expo helpers and sends push using the
  node-pushnotifications library which supports web push subscriptions.

  Environment variables expected:
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT

  Usage:
    const push = require('../lib/push-notifications');
    await push.sendBatchWebPush([{ subscription: <object>, payload: { title, body, ... } }]);
*/

const PushNotifications = require('node-pushnotifications');

const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const vapidContact = process.env.VAPID_CONTACT || 'mailto:admin@example.com';

const settings = {
  web: {
    vapidDetails: {
      subject: vapidContact,
      publicKey: vapidPublic,
      privateKey: vapidPrivate
    },
    contentEncoding: 'aes128gcm'
  }
};

let pushService = null;
try {
  pushService = new PushNotifications(settings);
} catch (e) {
  console.warn('Failed to initialize node-pushnotifications:', e && e.message ? e.message : e);
}

async function sendWebPush(subscription, payload = {}) {
  if (!pushService) return { ok: false, error: 'push_service_unavailable' };
  if (!subscription) return { ok: false, error: 'invalid_subscription' };

  // Normalize subscription: allow stored JSON strings, objects, or endpoint strings
  let regItem = subscription;
  if (typeof subscription === 'string') {
    // Try to parse JSON string first
    try {
      regItem = JSON.parse(subscription);
    } catch (e) {
      // Not JSON — treat as endpoint-only string
      regItem = { endpoint: subscription };
    }
  }

  const reg = [regItem];

  // Build data object according to node-pushnotifications format
  const data = {
    title: payload.title || payload.heading || 'ChamFlorals',
    body: payload.body || payload.message || '',
    custom: payload.data || {},
    topic: payload.topic || undefined
  };

  try {
    const results = await pushService.send(reg, data);
    return { ok: true, results };
  } catch (err) {
    console.warn('node-pushnotifications send error:', err && err.message ? err.message : err);
    return { ok: false, error: err };
  }
}

async function sendBatchWebPush(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (const item of items) {
    try {
      const subscription = item.subscription || item.to || null;
      const payload = item.payload || item.data || item.body || {};
      const r = await sendWebPush(subscription, payload);
      out.push(r);
    } catch (e) {
      out.push({ ok: false, error: e });
    }
  }
  return out;
}

module.exports = { sendWebPush, sendBatchWebPush };
