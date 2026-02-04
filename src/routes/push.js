const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

// SECURITY: Validate JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const JWT_SECRET_SAFE = JWT_SECRET || 'dev-jwt-secret-change-in-production';

// VAPID keys for web push (should be stored in environment variables)
// Generate with: npx web-push generate-vapid-keys
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib37gp1f7bVKSdZyRzYlRUZf6Tv31S7x-Qc5Bk3Y1nElmW7KJj1vdE8cQvU',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'your-private-key-here'
};

webpush.setVapidDetails(
  'mailto:admin@chammyflorals.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Subscribe to push notifications
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userType } = req.body;
    if (userType === 'admin') {
      return res.status(400).json({ error: 'Admin push subscriptions are not supported. Use Messenger PSID notifications instead.' });
    }
    console.log('Push /subscribe called - auth header present:', !!req.headers.authorization, 'cookie present:', !!req.headers.cookie, 'session.passport.user:', req.session && req.session.passport ? req.session.passport.user : null, 'req.user:', !!req.user);
    if (!subscription) return res.status(400).json({ error: 'Subscription data required' });

    // Try to authenticate using existing auth middleware (admin sessions, env, DB sessions)
    const authMiddleware = require('../middleware/auth');
    await new Promise((resolve) => {
      try {
        authMiddleware(req, res, () => resolve());
      } catch (e) {
        // middleware may throw; allow fallthrough
        resolve();
      }
    });

    // If middleware already sent a response (401), stop
    if (res.headersSent) return;

    let userId = null;
    let tableName = userType === 'admin' ? 'admin_push_subscriptions' : 'customer_push_subscriptions';

    if (userType === 'admin') {
      // Admin subscriptions must be tied to an authenticated admin
      if (req.admin && req.admin.id) {
        userId = req.admin.id;
        tableName = 'admin_push_subscriptions';
      } else {
        return res.status(401).json({ error: 'Admin authentication required to subscribe' });
      }
    } else {
      // Customer flow: try to identify customer via session token, but allow anonymous subscriptions
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const { data: customerRow, error } = await supabase.from('customers').select('id').eq('session_token', token).limit(1).single();
          if (!error && customerRow && customerRow.id) {
            userId = customerRow.id;
            tableName = 'customer_push_subscriptions';
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // Build payload. Allow null user_id (anonymous subscription) for customers.
    const payload = {
      user_id: userId,
      subscription: subscription,
      user_type: userType || 'customer'
    };

    let dbData = null;
    let dbError = null;

    if (userId) {
      // Upsert by user_id for idempotency
      const upsertResult = await supabase.from(tableName).upsert(payload, { onConflict: 'user_id' });
      dbData = upsertResult.data;
      dbError = upsertResult.error;
      if (dbError) {
        const insertResult = await supabase.from(tableName).insert(payload);
        dbData = insertResult.data;
        dbError = insertResult.error;
      }
    } else {
      // Anonymous customer subscription: insert and accept duplicates
      const insertResult = await supabase.from(tableName).insert(payload);
      dbData = insertResult.data;
      dbError = insertResult.error;
    }

    if (dbError) {
      console.error('Error storing push subscription:', dbError);
      return res.status(500).json({
        error: 'Failed to store subscription',
        table: tableName,
        userId,
        details: dbError.message || String(dbError),
        code: dbError.code,
        hint: dbError.hint || 'Verify the table exists and server is using a Supabase service role key or disable RLS for this table.'
      });
    }

    res.json({ success: true, message: 'Subscription saved', userId, table: tableName, data: dbData || null });
  } catch (error) {
    console.error('Error in /subscribe:', error && error.message ? error.message : error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

// Send push notification to specific user
router.post('/send', async (req, res) => {
  try {
    const { userId, userType, title, body, url, icon, data } = req.body;
    if (!userId || !userType) {
      return res.status(400).json({ error: 'userId and userType required' });
    }
    if (userType === 'admin') return res.status(400).json({ error: 'Admin push notifications not supported' });
    const tableName = 'customer_push_subscriptions';

    // Get subscription from database
    const { data: subscriptions, error } = await supabase
      .from(tableName)
      .select('subscription')
      .eq('user_id', userId);

    if (error || !subscriptions || subscriptions.length === 0) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const subscription = subscriptions[0].subscription;

    const payload = JSON.stringify({
      title: title || 'Chammy Florals',
      body: body || 'You have a new notification',
      icon: icon || '/flowers/cherry-blossom.png',
      badge: '/flowers/cherry-blossom.png',
      url: url || '/',
      data: data || {},
      tag: 'chammy-florals',
      requireInteraction: false
    });

    await webpush.sendNotification(subscription, payload);

    res.json({ success: true, message: 'Notification sent' });
  } catch (error) {
    console.error('Error sending push notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send push notification to all users of a type
router.post('/send-all', async (req, res) => {
  try {
    const { userType, title, body, url, icon } = req.body;

    if (!userType) {
      return res.status(400).json({ error: 'userType required' });
    }

    if (userType === 'admin') return res.status(400).json({ error: 'Admin push notifications not supported' });
    const tableName = 'customer_push_subscriptions';

    // Get all subscriptions
    const { data: subscriptions, error } = await supabase
      .from(tableName)
      .select('subscription');

    if (error || !subscriptions) {
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }

    const payload = JSON.stringify({
      title: title || 'Chammy Florals',
      body: body || 'You have a new notification',
      icon: icon || '/flowers/cherry-blossom.png',
      badge: '/flowers/cherry-blossom.png',
      url: url || '/',
      tag: 'chammy-florals',
      requireInteraction: false
    });

    const promises = subscriptions.map(sub => 
      webpush.sendNotification(sub.subscription, payload).catch(err => {
        console.error('Failed to send to subscription:', err);
      })
    );

    await Promise.all(promises);

    res.json({ success: true, message: `Sent to ${subscriptions.length} subscribers` });
  } catch (error) {
    console.error('Error sending bulk push notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// Unsubscribe from push notifications
router.post('/unsubscribe', async (req, res) => {
  try {
    const { userType } = req.body;
    if (userType === 'admin') return res.status(400).json({ error: 'Admin push subscriptions not supported' });
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const decoded = jwt.verify(token, JWT_SECRET_SAFE);
    const userId = decoded.id;

    const tableName = userType === 'admin' 
      ? 'admin_push_subscriptions' 
      : 'customer_push_subscriptions';

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({ error: 'Failed to unsubscribe' });
    }

    res.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error in /unsubscribe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
