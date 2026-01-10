// Notification manager removed — push notifications and cookie consent UI disabled.
// File retained as a no-op to avoid missing script errors in existing HTML.
class NotificationManager {
  constructor() { /* intentionally empty */ }
  async init() { return; }
}

// Expose default instance for compatibility
window.NotificationManager = NotificationManager;
/* PUSH/Cookie/push code removed - legacy implementation commented out below */
/*

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
        console.log('🔒 isSecureContext =', window.isSecureContext);
        console.log('🌐 navigator.onLine =', navigator.onLine);
        console.log('🧭 SW controller present =', !!navigator.serviceWorker.controller);
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
            setTimeout(() => reject(new Error('pushManager.subscribe timed out after 30s')), 30000);
          });

          subscription = await Promise.race([subscribePromise, timeoutPromise]);
          console.log('✅ Push subscription created successfully!');
          console.log('Subscription details:', subscription);
        } catch (subscribeError) {
          const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          console.warn('⚠️ Could not create push subscription:', subscribeError.message);
          if (isLocalhost) {
            console.info('💡 Localhost push can be flaky; test on production HTTPS for best results.');
          } else {
            console.info('💡 In production, this often means the browser push service is blocked/unreachable (extensions, network, or browser settings).');
            console.info('💡 Try: (1) Chrome/Edge normal window, (2) disable ad/tracker blockers for this site, (3) Application → Service Workers → Unregister + Clear site data, then reload.');
          }
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
    // Detect tokens and cookies
    const token = this.userType === 'admin'
      ? localStorage.getItem('adminToken')
      : localStorage.getItem('auth_token');

    const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.includes('connect.sid');
    console.log('sendSubscriptionToServer: userType=', this.userType, 'tokenPresent=', !!token, 'sessionCookie=', !!hasSessionCookie);

    const maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
      try {
        attempt += 1;

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Always include credentials so cookie-based sessions are sent
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            userType: this.userType
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Subscription saved to server:', result);
          return;
        }

        // Read response body (try JSON then text)
        let bodyText = '';
        try {
          const json = await response.json();
          bodyText = JSON.stringify(json);
        } catch (e) {
          bodyText = await response.text();
        }

        // Handle 401 specifically: if admin required and we have no token/cookie, stop and inform the developer
        if (response.status === 401) {
          console.warn('Server returned 401 when saving subscription:', bodyText);
          // If admin subscription but no token or session cookie, give a clear hint
          if (this.userType === 'admin') {
            // If there's a session cookie, attempt a session refresh endpoint to mint a new session_token
            if (hasSessionCookie) {
              try {
                console.log('Attempting admin session refresh via cookie...');
                const resp = await fetch('/api/admin/session/refresh', { method: 'POST', credentials: 'include' });
                if (resp.ok) {
                  const json = await resp.json();
                  if (json && json.token) {
                    console.log('Session refresh succeeded, storing adminToken and retrying subscription');
                    localStorage.setItem('adminToken', json.token);
                    // retry once by continuing the loop (don't increment attempt)
                    attempt = Math.max(0, attempt - 1);
                    continue;
                  }
                }
                console.warn('Session refresh did not return a new token:', resp.status);
              } catch (refreshErr) {
                console.warn('Admin session refresh failed:', refreshErr && refreshErr.message ? refreshErr.message : refreshErr);
              }
            }

            // If no cookie or refresh failed, give a clear hint
            if (!token && !hasSessionCookie) {
              console.error('Admin subscription blocked: no admin token found in localStorage and no session cookie present. Ensure admin is logged in (cookie) or set `adminToken` in localStorage before subscribing.');
            }
          }

          lastError = new Error(bodyText || 'Unauthorized');
          break; // don't retry further on 401
        }

        // Handle 429 with exponential backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          let waitMs = 5000 * attempt; // base 5s
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) waitMs = parsed * 1000;
          }
          console.warn(`Server returned 429 (attempt ${attempt}). Retrying after ${waitMs}ms.`, bodyText);
          lastError = new Error(bodyText || 'Too many requests');
          await new Promise(r => setTimeout(r, waitMs));
          continue; // retry
        }

        // For other non-OK statuses, log and break (no retries)
        console.error('❌ Failed to save subscription to server. Status:', response.status, bodyText);
        lastError = new Error(bodyText || `HTTP ${response.status}`);
        break;
      } catch (err) {
        console.error('Network/error sending subscription to server (attempt', attempt, '):', err);
        lastError = err;
        // small backoff before retrying
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (lastError) {
      console.error('❌ Failed to save subscription after retries:', lastError);
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
*/
