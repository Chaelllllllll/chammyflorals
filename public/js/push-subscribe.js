(function(){
  // Adapted push subscription flow (UI prompt + subscribe + unregister)
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function fetchPublicKey() {
    try {
      const res = await fetch('/api/push/public-key');
      if (!res.ok) return null;
      const j = await res.json();
      return j.publicKey || null;
    } catch (e) {
      return null;
    }
  }

  async function postJSON(url, body) {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // include credentials so cookie-based sessions (admin) are sent
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
  }

  async function sendSubscriptionToServer(subscription) {
    try {
      const customer = JSON.parse(localStorage.getItem('customer') || '{}');
      const body = {
        subscription: subscription,
        email: customer.email || null,
        phone: customer.phone || null
      };
      const res = await postJSON('/api/push/register', body);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function sendUnregisterToServer(endpoint) {
    try {
      const body = { endpoint };
      const res = await postJSON('/api/push/unregister', body);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function registerServiceWorkerAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await fetchPublicKey();
        if (!publicKey) return false;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }
      const ok = await sendSubscriptionToServer(subscription);
      if (ok) localStorage.setItem('push_subscribed', '1');
      return ok;
    } catch (e) {
      return false;
    }
  }

  async function unsubscribeFromPush() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return false;
      const endpoint = subscription.endpoint || (subscription && subscription.toJSON && subscription.toJSON().endpoint);
      const unsub = await subscription.unsubscribe();
      await sendUnregisterToServer(endpoint);
      localStorage.removeItem('push_subscribed');
      return unsub;
    } catch (e) {
      return false;
    }
  }

  function createPromptBar() {
    const existing = document.getElementById('push-perm-bar');
    if (existing) return existing;
    const bar = document.createElement('div');
    bar.id = 'push-perm-bar';
    bar.style.position = 'fixed';
    bar.style.left = '12px';
    bar.style.right = '12px';
    bar.style.bottom = '20px';
    bar.style.background = '#fff';
    bar.style.border = '1px solid #eee';
    bar.style.boxShadow = '0 6px 30px rgba(0,0,0,0.08)';
    bar.style.padding = '12px 16px';
    bar.style.borderRadius = '10px';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '12px';

    const text = document.createElement('div');
    text.style.flex = '1';
    text.innerHTML = '<strong>Enable notifications?</strong> Get updates for new announcements, products, and replies.';

    const btnEnable = document.createElement('button');
    btnEnable.className = 'btn btn-save';
    btnEnable.textContent = 'Enable';
    btnEnable.onclick = async () => {
      try {
        const p = await Notification.requestPermission();
        if (p === 'granted') {
          await registerServiceWorkerAndSubscribe();
        }
      } finally {
        bar.remove();
      }
    };

    const btnNo = document.createElement('button');
    btnNo.className = 'btn btn-cancel';
    btnNo.textContent = 'No thanks';
    btnNo.onclick = () => bar.remove();

    bar.appendChild(text);
    bar.appendChild(btnNo);
    bar.appendChild(btnEnable);
    document.body.appendChild(bar);
    return bar;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('auth_token');
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('connect.sid') !== -1;
    if (!token && !hasSessionCookie) return; // only for logged-in users (token or session cookie)

    // Do not show the in-page prompt bar (we use modal prompt instead).
    // Previously we showed the bar when Notification.permission === 'default'. That behavior is disabled.

    // If already granted, ensure subscription exists
    if (Notification && Notification.permission === 'granted' && !localStorage.getItem('push_subscribed')) {
      setTimeout(() => registerServiceWorkerAndSubscribe(), 800);
    }
  });

  // Expose unsubscribe for other UI
  window.__chammyPush = { unsubscribe: unsubscribeFromPush };
})();
