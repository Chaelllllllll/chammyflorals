# Push Notifications Setup Guide

## 🔔 Push Notifications with PWA Builder

Yes! PWA Builder **fully supports push notifications** on Android!

### What Works:
✅ Android (Chrome, Edge, Firefox) - Full support
✅ Windows (Edge, Chrome) - Full support
✅ macOS (Chrome, Edge, Safari 16+) - Full support
⚠️ iOS (Safari 16.4+) - Limited support

---

## 🚀 Implementation (Already Done!)

I've added everything you need:

### Files Created:
1. **`public/service-worker.js`** - Handles push notifications
2. **`src/utils/pushNotifications.js`** - Helper functions
3. **Updated `index.html`** - Registers service worker

---

## 📱 How to Use in Your App

### Step 1: Add Notification Button to Your App

Example in your Home page or any component:

```javascript
import { subscribeToPushNotifications, showLocalNotification } from '../utils/pushNotifications';

function NotificationButton() {
  const handleSubscribe = async () => {
    // Your VAPID public key from backend
    const vapidKey = 'YOUR_VAPID_PUBLIC_KEY';
    
    const subscription = await subscribeToPushNotifications(vapidKey);
    if (subscription) {
      // Send to backend to save
      await sendSubscriptionToBackend(subscription);
      alert('Notifications enabled!');
    }
  };

  return (
    <button onClick={handleSubscribe} className="btn btn-pink">
      <i className="fa fa-bell me-2"></i>Enable Notifications
    </button>
  );
}
```

### Step 2: Test with Local Notification (No backend needed)

```javascript
import { showLocalNotification } from '../utils/pushNotifications';

// Show a test notification
await showLocalNotification('Order Update', {
  body: 'Your flower bouquet is ready for delivery!',
  icon: '/flowers/cherry-blossom.png',
  tag: 'order-123'
});
```

---

## 🔧 Backend Setup (Required for Real Push)

You need to add push notification support to your backend:

### 1. Install web-push package:

```bash
npm install web-push
```

### 2. Generate VAPID keys (one-time):

```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

// Save these keys in your .env file
```

### 3. Add to your backend (api.js):

```javascript
const webpush = require('web-push');

// Configure VAPID
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Store subscriptions (use database in production)
const subscriptions = [];

// Subscribe endpoint
router.post('/api/push-subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.json({ success: true });
});

// Send notification endpoint
router.post('/api/send-notification', async (req, res) => {
  const { title, body, userId } = req.body;
  
  const payload = JSON.stringify({
    title: title,
    body: body,
    icon: '/flowers/cherry-blossom.png',
    data: { url: '/mobile/' }
  });

  // Send to all subscribed users
  const notifications = subscriptions.map(subscription => {
    return webpush.sendNotification(subscription, payload);
  });

  try {
    await Promise.all(notifications);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});
```

---

## 💡 Use Cases for Your Flower Shop

### 1. Order Status Updates
```javascript
// When order status changes in admin
await sendNotification({
  title: 'Order Update',
  body: 'Your order #123 is out for delivery!',
  icon: '/flowers/cherry-blossom.png',
  data: { url: '/mobile/', orderId: '123' }
});
```

### 2. New Promotions
```javascript
await sendNotification({
  title: '🌸 Special Offer!',
  body: '20% off all roses this Valentine\'s Day!',
  image: '/flowers/roses-promo.jpg'
});
```

### 3. Delivery Reminder
```javascript
await sendNotification({
  title: 'Delivery Soon',
  body: 'Your flowers will arrive in 30 minutes',
  requireInteraction: true
});
```

### 4. Review Request
```javascript
await sendNotification({
  title: 'How was your order?',
  body: 'Leave a review and get 10% off your next order!',
  actions: [
    { action: 'review', title: 'Write Review' },
    { action: 'dismiss', title: 'Later' }
  ]
});
```

---

## 🧪 Testing Push Notifications

### Option 1: Test Locally (Simple)

```javascript
// In your browser console or React component
import { showLocalNotification } from './utils/pushNotifications';

showLocalNotification('Test', {
  body: 'This is a test notification!',
  icon: '/flowers/cherry-blossom.png'
});
```

### Option 2: Test with PWA Builder

1. Deploy your app to Vercel
2. Go to https://www.pwabuilder.com/
3. Enter your URL
4. Check "Push Notifications" feature
5. Test in browser

### Option 3: Test with Chrome DevTools

1. Open DevTools → Application → Service Workers
2. Click "Push" to simulate a push event
3. Check if notification appears

---

## 📊 PWA Builder Features Summary

| Feature | PWA Builder Support |
|---------|-------------------|
| Push Notifications | ✅ Yes - Full support |
| Badge Notifications | ✅ Yes |
| Background Sync | ✅ Yes |
| Offline Mode | ✅ Yes |
| App Icons | ✅ Yes |
| Splash Screen | ✅ Yes |
| Share Target | ✅ Yes |
| Camera Access | ⚠️ Limited |
| Contacts Access | ❌ No |

---

## 🎯 Quick Start

### Today (No Backend):

```javascript
// Add this to your Home.jsx
import { showLocalNotification } from '../utils/pushNotifications';

// Test notification button
<button onClick={() => showLocalNotification('Test', {
  body: 'Notifications are working!'
})}>
  Test Notification
</button>
```

### This Week (With Backend):

1. Generate VAPID keys
2. Add endpoints to backend
3. Subscribe users in your React app
4. Send notifications from admin panel

---

## 🔒 Important Notes

### Privacy:
- Always ask user permission first
- Allow users to unsubscribe easily
- Don't spam notifications

### Best Practices:
- **Relevant**: Only send important updates
- **Timely**: Send at appropriate times
- **Actionable**: Include clear next steps
- **Personalized**: Use customer name/order details

### Rate Limiting:
- Don't send more than 3-5 per day
- Group similar notifications
- Allow users to set preferences

---

## 📞 Testing Checklist

Before going live:

- [ ] Service worker registers successfully
- [ ] Notification permission prompt works
- [ ] Notifications appear on Android
- [ ] Clicking notification opens app
- [ ] Unsubscribe works
- [ ] Backend stores subscriptions
- [ ] Admin can send test notifications
- [ ] Notifications look good (icon, image, text)

---

## 🆘 Troubleshooting

**Notifications not showing:**
- Check permission granted: `Notification.permission`
- Verify service worker registered
- Check browser console for errors
- Test on real Android device (not emulator)

**Service worker not loading:**
- Must be served over HTTPS (Vercel provides this)
- Check file path is `/service-worker.js`
- Clear browser cache and re-register

---

**Ready to enable push notifications?** The code is ready - just deploy and users can start subscribing! 🔔🌸
