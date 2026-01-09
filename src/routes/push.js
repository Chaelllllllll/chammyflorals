const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const supabase = require('../config/supabase');

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
    
    if (!subscription) {
      return res.status(400).json({ error: 'Subscription data required' });
    }

    // Get user ID from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let userId, tableName;
    
    if (userType === 'admin') {
      // For admin, decode JWT to get admin ID
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.id;
        tableName = 'admin_push_subscriptions';
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      // For customer, decode JWT to get customer ID
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        userId = decoded.id;
        tableName = 'customer_push_subscriptions';
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    // Store subscription in database
    const { data, error } = await supabase
      .from(tableName)
      .upsert({
        user_id: userId,
        subscription: subscription,
        user_type: userType,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Error saving subscription:', error);
      return res.status(500).json({ error: 'Failed to save subscription' });
    }

    res.json({ success: true, message: 'Subscription saved' });
  } catch (error) {
    console.error('Error in /subscribe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send push notification to specific user
router.post('/send', async (req, res) => {
  try {
    const { userId, userType, title, body, url, icon, data } = req.body;

    if (!userId || !userType) {
      return res.status(400).json({ error: 'userId and userType required' });
    }

    const tableName = userType === 'admin' 
      ? 'admin_push_subscriptions' 
      : 'customer_push_subscriptions';

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

    const tableName = userType === 'admin' 
      ? 'admin_push_subscriptions' 
      : 'customer_push_subscriptions';

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
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
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
