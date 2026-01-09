// Notification Manager - Handles browser push notifications with Service Worker
class NotificationManager {
  constructor(userType = 'customer') {
    this.userType = userType; // 'customer' or 'admin'
    this.checkInterval = null;
    this.modalShown = false;
    this.swRegistration = null;
    this.subscription = null;
    this.init();
  }

  async init() {
    // Check if notifications and service workers are supported
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      console.warn('This browser does not support service workers');
      return;
    }

    // Register service worker
    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('Service Worker registered:', this.swRegistration);

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('Service Worker ready');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return;
    }

    // Check current permission status
    const permission = Notification.permission;

    if (permission === 'granted') {
      console.log('Notification permission already granted');
      await this.subscribeToPush();
      this.startListening();
    } else if (permission === 'default') {
      // Start checking every 10 seconds
      this.startPermissionCheck();
    } else {
      console.log('Notification permission denied');
    }
  }

  startPermissionCheck() {
    // Show modal immediately
    this.showPermissionModal();

    // Then check every 10 seconds
    this.checkInterval = setInterval(() => {
      if (Notification.permission === 'default') {
        this.showPermissionModal();
      } else if (Notification.permission === 'granted') {
        this.stopPermissionCheck();
        this.startListening();
      } else {
        this.stopPermissionCheck();
      }
    }, 10000);
  }

  stopPermissionCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.hidePermissionModal();
  }

  showPermissionModal() {
    // Don't show if already shown
    if (this.modalShown) return;

    let modal = document.getElementById('notificationPermissionModal');
    
    // Create modal if it doesn't exist
    if (!modal) {
      modal = this.createPermissionModal();
      document.body.appendChild(modal);
    }

    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    this.modalShown = true;

    // Reset modalShown flag when modal is hidden
    modal.addEventListener('hidden.bs.modal', () => {
      this.modalShown = false;
    });
  }

  hidePermissionModal() {
    const modal = document.getElementById('notificationPermissionModal');
    if (modal) {
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) {
        bsModal.hide();
      }
    }
  }

  createPermissionModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'notificationPermissionModal';
    modal.setAttribute('data-bs-backdrop', 'static');
    modal.setAttribute('data-bs-keyboard', 'false');
    modal.setAttribute('tabindex', '-1');
    
    const title = this.userType === 'admin' 
      ? 'Stay Updated on Orders & Messages' 
      : 'Never Miss Updates!';
    
    const description = this.userType === 'admin'
      ? 'Get instant notifications for new orders, customer messages, and important updates.'
      : 'Get notified about new products, special announcements, and message replies.';

    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
          <div class="modal-header" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); border: none; padding: 1.5rem;">
            <h5 class="modal-title text-white d-flex align-items-center">
              <i class="fas fa-bell me-2"></i>
              ${title}
            </h5>
          </div>
          <div class="modal-body text-center p-4">
            <div class="mb-3">
              <i class="fas fa-bell-slash" style="font-size: 4rem; color: #ff6f9b; opacity: 0.3;"></i>
            </div>
            <h6 class="mb-3" style="color: #3a2b33; font-weight: 600;">${description}</h6>
            <p class="text-muted mb-4" style="font-size: 0.9rem;">
              Click "Allow" to enable notifications and stay connected.
            </p>
            <div class="d-grid gap-2">
              <button type="button" class="btn btn-primary" id="enableNotificationsBtn" style="background: linear-gradient(135deg, #ff99bb 0%, #ff6f9b 100%); border: none; padding: 12px; border-radius: 10px; font-weight: 600;">
                <i class="fas fa-bell me-2"></i>Enable Notifications
              </button>
              <button type="button" class="btn btn-outline-secondary" id="notificationLaterBtn" style="border-radius: 10px;">
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    modal.querySelector('#enableNotificationsBtn').addEventListener('click', () => {
      this.requestPermission();
    });

    modal.querySelector('#notificationLaterBtn').addEventListener('click', () => {
      const bsModal = bootstrap.Modal.getInstance(modal);
      if (bsModal) bsModal.hide();
    });

    return modal;
  }

  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        this.showNotification('Notifications Enabled!', {
          body: 'You will now receive updates and notifications.',
          icon: '/flowers/cherry-blossom.png',
          badge: '/flowers/cherry-blossom.png'
        });
        
        await this.subscribeToPush();
        this.stopPermissionCheck();
        this.startListening();
      } else {
        console.log('Notification permission denied');
        this.stopPermissionCheck();
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  }

  async subscribeToPush() {
    console.log('📱 subscribeToPush() called');
    
    if (!this.swRegistration) {
      console.error('Service Worker not registered');
      return;
    }

    try {
      console.log('🔍 Checking for existing subscription...');
      // Check if already subscribed
      let subscription = await this.swRegistration.pushManager.getSubscription();
      
      if (!subscription) {
        console.log('📝 No existing subscription, creating new one...');
        console.log('🔔 Notification.permission =', Notification.permission);
        // Subscribe to push notifications with VAPID key
        const publicVapidKey = 'BBEyMia5Ji-_hoLh6wtfvIp0883dPi4C1JZ1DDNkThbBn5WzQHqqEBa0oNBPN-eVrMt-5ukycbAtTAzG0SFeT7A';
        
        console.log('🔑 Converting VAPID key...');
        const applicationServerKey = this.urlBase64ToUint8Array(publicVapidKey);
        console.log('🔑 VAPID key byte length:', applicationServerKey.length);
        if (applicationServerKey.length !== 65) {
          throw new Error('VAPID public key is invalid (expected 65 bytes after decode)');
        }
        
        console.log('🚀 Subscribing to push manager...');
        try {
          const subscribePromise = this.swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
          });
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 5000);
          });

          subscription = await Promise.race([subscribePromise, timeoutPromise]);
          console.log('✅ Push subscription created successfully!');
          console.log('Subscription details:', subscription);
        } catch (subscribeError) {
          console.warn('⚠️ Could not create push subscription:', subscribeError.message);
          console.info('💡 This is normal on localhost. In-browser notifications will still work!');
          console.info('💡 Push notifications will work in production (HTTPS)');
          // Don't throw - continue without push subscription
          return;
        }
      } else {
        console.log('✅ Already subscribed to push notifications');
      }

      this.subscription = subscription;

      console.log('📤 Sending subscription to server...');
      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);
      
    } catch (error) {
      console.error('❌ Failed to subscribe to push notifications:', error);
      console.error('Error details:', error.message, error.stack);
      console.warn('Basic in-browser notifications will still work without push subscription');
    }
  }

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

  async sendSubscriptionToServer(subscription) {
    try {
      const token = this.userType === 'admin' 
        ? localStorage.getItem('adminToken')
        : localStorage.getItem('auth_token');

      if (!token) {
        console.warn('No auth token found, cannot save subscription');
        return;
      }

      const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://chammyflorals.vercel.app';

      const response = await fetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userType: this.userType
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Subscription saved to server:', result);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to save subscription to server. Status:', response.status);
        console.error('Error details:', errorText);
      }
    } catch (error) {
      console.error('Error sending subscription to server:', error);
    }
  }

  showNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
      const defaultOptions = {
        icon: '/flowers/cherry-blossom.png',
        badge: '/flowers/cherry-blossom.png',
        vibrate: [200, 100, 200],
        tag: 'chammy-florals',
        requireInteraction: false
      };

      const notification = new Notification(title, { ...defaultOptions, ...options });

      // Auto-close after 5 seconds if not interacted with
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Handle notification click
      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options.url) {
          window.location.href = options.url;
        }
      };

      return notification;
    }
  }

  startListening() {
    // This method will be extended to listen for real-time updates
    console.log('Started listening for notifications');
    
    // Store the notification manager instance globally
    window.notificationManager = this;
  }

  // Notification methods for different events
  notifyNewProduct(product) {
    this.showNotification('New Product Available! 🌸', {
      body: `${product.name} - Check it out now!`,
      icon: product.image || '/flowers/cherry-blossom.png',
      url: '/index.html'
    });
  }

  notifyAnnouncement(announcement) {
    this.showNotification('New Announcement 📢', {
      body: announcement.message || announcement.title,
      url: '/index.html'
    });
  }

  notifyNewMessage(message, sender) {
    const isAdmin = this.userType === 'admin';
    this.showNotification(`New Message from ${sender} 💬`, {
      body: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      url: isAdmin ? '/admin/messages.html' : '/dashboard.html'
    });
  }

  notifyOrderUpdate(orderId, status) {
    const statusMessages = {
      'pending': 'Your order is being processed',
      'confirmed': 'Your order has been confirmed!',
      'preparing': 'Your order is being prepared',
      'ready': 'Your order is ready for delivery',
      'delivered': 'Your order has been delivered!',
      'cancelled': 'Your order has been cancelled'
    };

    this.showNotification(`Order Update #${orderId}`, {
      body: statusMessages[status] || `Order status: ${status}`,
      url: this.userType === 'admin' ? '/admin/dashboard.html' : '/my-orders.html'
    });
  }

  notifyNewOrder(orderId, customerName) {
    if (this.userType === 'admin') {
      this.showNotification('New Order Received! 🎉', {
        body: `Order #${orderId} from ${customerName}`,
        url: '/admin/dashboard.html'
      });
    }
  }
}

// Initialize notification manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}

function initNotifications() {
  // Detect user type based on current page
  const isAdminPage = window.location.pathname.includes('/admin/');
  const userType = isAdminPage ? 'admin' : 'customer';
  
  // Create global notification manager instance
  if (!window.notificationManager) {
    window.notificationManager = new NotificationManager(userType);
  }
}
