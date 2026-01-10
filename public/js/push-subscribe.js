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
      const isLocal = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.port === '3000');
      const base = isLocal ? 'http://localhost:3000' : '';
      const res = await fetch(base + '/api/push/public-key');
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      return j && j.publicKey ? j.publicKey : null;
    } catch (e) {
      return null;
    }
  }

  async function postJSON(url, body) {
    const token = localStorage.getItem('auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // include credentials so cookie-based sessions (admin) are sent
    try {
      const isLocal = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.port === '3000');
      if (typeof url === 'string' && url.startsWith('/api/')) {
        url = (isLocal ? 'http://localhost:3000' : '') + url;
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
      if (!res.ok) {
        try { const txt = await res.text(); console.warn('postJSON non-ok response:', res.status, txt); } catch (e) {}
      }
      return res;
    } catch (e) {
      console.warn('postJSON fetch error:', e);
      throw e;
    }
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
      // intentionally quiet in production; successful registration handled by server
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
      // Register the service worker first
      const reg = await navigator.serviceWorker.register('/sw.js');

      // If there's a waiting worker (newly installed), ask it to skipWaiting and wait
      if (reg.waiting) {
        try {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });

          // Wait for the new worker to take control via controllerchange
          await new Promise((resolve) => {
            if (navigator.serviceWorker.controller) return resolve();
            const onChange = () => {
              navigator.serviceWorker.removeEventListener('controllerchange', onChange);
              resolve();
            };
            navigator.serviceWorker.addEventListener('controllerchange', onChange);
            // fallback timeout
            setTimeout(resolve, 2000);
          });
        } catch (pmErr) {
          console.warn('Failed to postMessage SKIP_WAITING', pmErr);
        }
      }

      // Also listen for an activation message from the service worker (helps when ready() stalls)
      const activationPromise = new Promise((resolve) => {
        const onMsg = (ev) => {
          try {
            if (ev && ev.data && ev.data.type === 'ACTIVATED') {
              navigator.serviceWorker.removeEventListener('message', onMsg);
              resolve();
            }
          } catch (e) {}
        };
        navigator.serviceWorker.addEventListener('message', onMsg);
        // fallback timeout
        setTimeout(() => {
          try { navigator.serviceWorker.removeEventListener('message', onMsg); } catch (e) {}
          resolve();
        }, 3000);
      });

      // Wait either for ready() or the activation message, whichever comes first
      await Promise.race([navigator.serviceWorker.ready, activationPromise]);
      const registration = await navigator.serviceWorker.getRegistration();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await fetchPublicKey();
        if (!publicKey) return false;
        // Try subscribing; on some browsers this can still fail immediately after activation.
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        } catch (subErr) {
          console.warn('Initial subscribe attempt failed, retrying after short delay', subErr);
          // brief wait and retry once
          await new Promise(r => setTimeout(r, 350));
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
          });
        }
        
      }
      // Try to send subscription to server with retries. If server doesn't record it,
      // attempt to unsubscribe/resubscribe a few times before showing instructions.
      const MAX_SEND_ATTEMPTS = 3;
      let ok = false;
      for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
        ok = await sendSubscriptionToServer(subscription);
        if (ok) break;
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
      if (ok) {
        localStorage.setItem('push_subscribed', '1');
        return true;
      }

      // Server did not accept subscription. Attempt to clean up and retry one more time.
      try {
        await subscription.unsubscribe();
      } catch (e) {}
      try { await sendUnregisterToServer(subscription && (subscription.endpoint || (subscription.toJSON && subscription.toJSON().endpoint))); } catch (e) {}

      // Final attempt to re-subscribe and send
      try {
        const publicKey = await fetchPublicKey();
        if (publicKey) {
          const newSub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
          const finalOk = await sendSubscriptionToServer(newSub);
          if (finalOk) {
            localStorage.setItem('push_subscribed', '1');
            return true;
          }
        }
      } catch (e) {}

      // Still failing: show user instructions to re-enable or reset notification permission
      showPushFailureInstructions();
      return false;
    } catch (e) {
      return false;
    }
  }

  function showPushFailureInstructions() {
    // Simple modal explaining steps to the user
    const existing = document.getElementById('push-failure-modal');
    if (existing) return;
    const modal = document.createElement('div');
    modal.id = 'push-failure-modal';
    modal.style.position = 'fixed';
    modal.style.left = '12px';
    modal.style.right = '12px';
    modal.style.top = '20px';
    modal.style.background = '#fff';
    modal.style.border = '1px solid #eee';
    modal.style.boxShadow = '0 6px 30px rgba(0,0,0,0.12)';
    modal.style.padding = '16px';
    modal.style.borderRadius = '8px';
    modal.style.zIndex = 99999;

    modal.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px">Notifications setup failed</div>
      <div style="margin-bottom:8px">We couldn't complete the browser subscription. To fix this:
        <ol>
          <li>Open your browser's notification settings for this site and disable notifications.</li>
          <li>Reload this page, then click "Enable" and allow notifications again.</li>
        </ol>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="push-failure-close" class="btn btn-cancel">Close</button>
        <button id="push-failure-open" class="btn btn-save">Open browser notification settings</button>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('push-failure-close').onclick = () => modal.remove();
    document.getElementById('push-failure-open').onclick = () => {
      // Try to open common settings pages (works in Chrome/Edge). If blocked, user must open manually.
      try { window.open('chrome://settings/content/notifications'); } catch (e) {}
      try { window.open('edge://settings/content/notifications'); } catch (e) {}
    };
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
        // Ensure service worker is registered and active before requesting permission
        let registration = null;
        if ('serviceWorker' in navigator) {
          try {
            await navigator.serviceWorker.register('/sw.js');
            registration = await navigator.serviceWorker.ready;
          } catch (swErr) {
            console.warn('Enable flow: service worker registration failed', swErr);
          }
        }

        const p = await Notification.requestPermission();
        if (p === 'granted') {
          // Always attempt the robust subscribe flow after permission is granted.
          // This ensures that even if the inline subscribe attempts fail due to
          // timing, the dedicated helper will handle waiting for activation and
          // POSTing the subscription to the server.
          try {
            if (!localStorage.getItem('push_subscribed')) {
              await registerServiceWorkerAndSubscribe();
            } else {
              
            }
          } catch (e) {
            console.warn('Enable flow: final subscribe helper failed', e);
          }
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
    // Pre-register service worker early so it's active before permission prompt.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(() => {
      }).catch(err => {
        console.warn('Service Worker pre-register failed:', err);
      });

      // If a new service worker becomes controller, reload once so the page is controlled
      // by the active worker and registration.pushManager is reliable.
      try {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          try {
            if (window.__chammy_waiting_for_controller) {
              return;
            }
            if (!window.__sw_reloaded) {
              window.__sw_reloaded = true;
              window.location.reload();
            }
          } catch (e) { console.warn('controllerchange handler error', e); }
        });
      } catch (e) {}
    }

    const token = localStorage.getItem('auth_token');
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('connect.sid') !== -1;
    if (!token && !hasSessionCookie) return; // only for logged-in users (token or session cookie)

    // Do not show the in-page prompt bar (we use modal prompt instead).
    // Previously we showed the bar when Notification.permission === 'default'. That behavior is disabled.

    // If already granted, ensure subscription exists
    if (Notification && Notification.permission === 'granted' && !localStorage.getItem('push_subscribed')) {
      setTimeout(() => registerServiceWorkerAndSubscribe(), 800);
    }

    // Watch for permission changes (some browsers don't emit an event when user accepts prompt)
    // Poll for a short window and trigger subscribe when permission becomes 'granted'.
    try {
      if (Notification && Notification.permission !== 'granted' && !localStorage.getItem('push_subscribed')) {
        let checks = 0;
        const maxChecks = 20; // ~10s
        const watcher = setInterval(async () => {
          checks++;
          if (Notification.permission === 'granted') {
            clearInterval(watcher);
            try { await registerServiceWorkerAndSubscribe(); } catch (e) { console.warn('permission-watcher subscribe error', e); }
          } else if (checks >= maxChecks) {
            clearInterval(watcher);
          }
        }, 500);
      }
    } catch (e) { console.warn('permission watcher setup failed', e); }
  });

  // Expose unsubscribe for other UI
  // Expose helpers for UI and debugging. Use `window.__chammyPush.subscribe()` to
  // manually trigger the robust subscribe flow (useful when auth/session gating
  // prevents automatic prompts during testing).
  window.__chammyPush = {
    unsubscribe: unsubscribeFromPush,
    subscribe: registerServiceWorkerAndSubscribe
  };
})();
