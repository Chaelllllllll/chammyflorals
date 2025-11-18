// Push Notification Helper Functions

/**
 * Check if push notifications are supported
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

/**
 * Subscribe to push notifications
 * @param {string} vapidPublicKey - Your VAPID public key from backend
 */
export async function subscribeToPushNotifications(vapidPublicKey) {
  try {
    // Register service worker
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered');

    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;

    // Request permission
    const permissionGranted = await requestNotificationPermission();
    if (!permissionGranted) {
      console.log('Notification permission denied');
      return null;
    }

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    console.log('Push subscription:', subscription);
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
}

/**
 * Send subscription to your backend
 */
export async function sendSubscriptionToBackend(subscription) {
  try {
    const response = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscription)
    });

    if (!response.ok) {
      throw new Error('Failed to send subscription to backend');
    }

    console.log('Subscription sent to backend successfully');
    return true;
  } catch (error) {
    console.error('Error sending subscription to backend:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      console.log('Unsubscribed from push notifications');
      
      // Notify backend
      await fetch('/api/push-unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return false;
  }
}

/**
 * Check if user is currently subscribed
 */
export async function isSubscribed() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}

/**
 * Get current subscription
 */
export async function getSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
}

/**
 * Helper function to convert VAPID key
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Show a local notification (doesn't require push service)
 */
export async function showLocalNotification(title, options = {}) {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body || '',
      icon: options.icon || '/flowers/cherry-blossom.png',
      badge: options.badge || '/flowers/cherry-blossom.png',
      image: options.image,
      tag: options.tag || 'default',
      requireInteraction: options.requireInteraction || false,
      actions: options.actions || [],
      data: options.data || {}
    });
  }
}
