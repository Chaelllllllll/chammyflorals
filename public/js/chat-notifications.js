// Lightweight chat notification helper — no push/subscription or Service Worker usage.
class ChatNotifications {
  constructor() {
    this.permission = (typeof Notification !== 'undefined' && Notification.permission) ? Notification.permission : 'default';
    this.lastMessageId = null;
    this.lastMessageCount = {};
    this.swRegistered = false;
  }

  async requestPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const p = await Notification.requestPermission();
    this.permission = p;
    return p === 'granted';
  }

  showNotification(title, options = {}) {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission !== 'granted') return;
      const opts = Object.assign({ icon: '/flowers/cherry-blossom.png', badge: '/flowers/cherry-blossom.png' }, options);
      const n = new Notification(title, opts);
      setTimeout(() => { try { n.close(); } catch (e) {} }, 5000);
      n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
    } catch (e) {
      console.error('Notification failed:', e);
    }
  }

  playSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.04;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => {
        try { o.stop(); ctx.close(); } catch (e) {}
      }, 120);
    } catch (e) {
      // ignore audio errors
    }
  }

  // Handle an array of messages; returns true if a new admin notification was shown
  handleMessages(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) return false;

    const latestMessage = messages[messages.length - 1];

    // Check if latest message is from admin and is new
    if (latestMessage && latestMessage.sender_type === 'admin' && latestMessage.id !== this.lastMessageId) {
      this.showNotification('Chammy Florals', {
        body: latestMessage.message || '',
        tag: 'chat-reply',
        data: { url: '/' }
      });
      this.playSound();
      this.lastMessageId = latestMessage.id;
      return true;
    }

    return false;
  }

  // Register a lightweight service worker (optional); do not force permission request here
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      this.swRegistered = true;
      return !!reg;
    } catch (e) {
      console.warn('Service worker registration failed:', e);
      return false;
    }
  }

  // Initialize - register service worker but DON'T auto-request permission
  async init() {
    await this.registerServiceWorker();
    // Permission is requested explicitly by the app when appropriate
  }

  // Reset message counts (useful when clearing data)
  reset() {
    this.lastMessageCount = {};
    this.lastMessageId = null;
  }
}

// Create global instance
window.chatNotifications = new ChatNotifications();
