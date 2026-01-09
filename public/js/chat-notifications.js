// Chat notification system for push notifications
class ChatNotifications {
  constructor() {
    this.permission = 'default';
    this.lastMessageCount = {};
    this.notificationSound = null;
    this.registration = null;
    this.subscription = null;
  }

  // Register service worker
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered:', registration);
      this.registration = registration;

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }

  // Subscribe to push notifications
  async subscribeToPush() {
    if (!this.registration) {
      await this.registerServiceWorker();
    }

    if (!this.registration) {
      console.error('No service worker registration available');
      return null;
    }

    try {
      // Check if already subscribed
      let subscription = await this.registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Subscribe to push notifications
        // Using a VAPID key would be needed for production
        // For now, we'll use service worker notifications without push server
        subscription = await this.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(
            // This is a dummy VAPID public key - in production, generate your own
            'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8xQmrXj-kGSWy3zZEo5s6K8T6qhkSHH7jqMvLqJ3yPaJHGwPCb2JJE'
          )
        });
        
        console.log('Push subscription created:', subscription);
        this.subscription = subscription;
        
        // Send subscription to server
        await this.sendSubscriptionToServer(subscription);
      }

      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return null;
    }
  }

  // Helper to convert VAPID key
  urlBase64ToUint8Array(base64String) {
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

  // Send subscription to server
  async sendSubscriptionToServer(subscription) {
    try {
      const token = localStorage.getItem('adminToken');
      const userType = token ? 'admin' : 'customer';
      const userId = localStorage.getItem('currentOrderId') || null;

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId,
          userType
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      console.log('Subscription saved to server');
    } catch (error) {
      console.error('Error saving subscription to server:', error);
    }
  }

  // Request notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      console.log('Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      await this.subscribeToPush();
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      
      if (permission === 'granted') {
        await this.subscribeToPush();
      }
      
      return permission === 'granted';
    }

    return false;
  }

  // Show notification via service worker
  async showNotification(title, options = {}) {
    if (this.permission !== 'granted') return;

    try {
      if (this.registration) {
        // Use service worker to show notification (works even when page is closed)
        await this.registration.showNotification(title, {
          icon: '/flowers/cherry-blossom.png',
          badge: '/flowers/cherry-blossom.png',
          requireInteraction: false,
          vibrate: [200, 100, 200],
          tag: 'chat-notification',
          ...options
        });
      } else {
        // Fallback to regular notification
        const notification = new Notification(title, {
          icon: '/flowers/cherry-blossom.png',
          badge: '/flowers/cherry-blossom.png',
          requireInteraction: false,
          ...options
        });

        setTimeout(() => notification.close(), 5000);

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  // Play notification sound
  playSound() {
    try {
      // Create a simple notification beep using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (err) {
      console.error('Could not play sound:', err);
    }
  }

  // Check for new messages (for admin)
  checkNewMessages(orders, orderId = null) {
    let hasNew = false;

    orders.forEach(order => {
      const key = order.order_id;
      const currentCount = order.messageCount || 0;
      const lastCount = this.lastMessageCount[key] || 0;

      if (currentCount > lastCount) {
        hasNew = true;
        
        // Only notify if not currently viewing this chat
        if (orderId !== order.order_id) {
          const customerName = order.customer_name || order.name || 'Customer';
          this.showNotification('New Message from ' + customerName, {
            body: order.lastMessage?.message || 'You have a new message',
            tag: `chat-${key}`,
            data: { url: '/admin/messages.html', orderId: key }
          });
          this.playSound();
        }
      }

      this.lastMessageCount[key] = currentCount;
    });

    return hasNew;
  }

  // Check for new admin replies (for customer)
  checkNewAdminReply(messages, lastMessageId) {
    if (!messages || messages.length === 0) return false;

    const latestMessage = messages[messages.length - 1];
    
    // Check if latest message is from admin and is new
    if (latestMessage.sender_type === 'admin' && latestMessage.id !== lastMessageId) {
      this.showNotification('Chammy Florals', {
        body: latestMessage.message,
        tag: 'chat-reply',
        data: { url: '/' }
      });
      this.playSound();
      return true;
    }

    return false;
  }

  // Initialize - register service worker but DON'T auto-request permission
  async init() {
    // Register service worker first
    await this.registerServiceWorker();
    
    // Permission will be requested explicitly after order placement or valid order ID entry
  }

  // Reset message counts (useful when clearing data)
  reset() {
    this.lastMessageCount = {};
  }
}

// Create global instance
window.chatNotifications = new ChatNotifications();
