(function(){
  // Show a persistent modal asking for Notification permission every 10 seconds until granted or denied.
  const INTERVAL_MS = 10000;
  let intervalId = null;
  let modalOpen = false;

  function isLoggedIn() {
    const token = localStorage.getItem('auth_token');
    const adminToken = localStorage.getItem('adminToken');
    // Cookie-based sessions are often HttpOnly and not visible to JS; treat admin pages as logged-in
    const isAdminPage = typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('admin-page');
    const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('connect.sid') !== -1;
    return !!(token || adminToken || hasSessionCookie || isAdminPage);
  }

  function createModal() {
    if (modalOpen) return;
    modalOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'notify-prompt-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.zIndex = 9999;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const box = document.createElement('div');
    box.id = 'notify-prompt-box';
    box.style.width = '420px';
    box.style.maxWidth = '92%';
    box.style.background = '#fff';
    box.style.borderRadius = '12px';
    box.style.padding = '20px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    box.style.textAlign = 'left';

    const title = document.createElement('h4');
    title.textContent = 'Enable Notifications';
    title.style.margin = '0 0 8px 0';

    const p = document.createElement('p');
    p.style.margin = '0 0 16px 0';
    p.style.color = '#333';
    p.textContent = 'Allow browser notifications to receive updates for new announcements, products, and message replies.';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.justifyContent = 'flex-end';

    const btnLater = document.createElement('button');
    btnLater.type = 'button';
    btnLater.className = 'btn btn-cancel';
    btnLater.textContent = 'Remind me later';
    btnLater.onclick = () => { closeModal(); };

    const btnAllow = document.createElement('button');
    btnAllow.type = 'button';
    btnAllow.className = 'btn btn-save';
    btnAllow.textContent = 'Allow Notifications';
    btnAllow.onclick = async () => {
      try {
        const p = await Notification.requestPermission();
        if (p === 'granted') {
          // register service worker and subscribe to push
          await registerAndSubscribe();
          clearAll();
        } else if (p === 'denied') {
          // stop prompting if user explicitly denied
          localStorage.setItem('notify_prompt_denied', '1');
          clearAll();
        }
      } catch (e) {
        // ignore
      } finally {
        closeModal();
      }
    };

    actions.appendChild(btnLater);
    actions.appendChild(btnAllow);

    box.appendChild(title);
    box.appendChild(p);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function closeModal() {
    const overlay = document.getElementById('notify-prompt-overlay');
    if (overlay) overlay.remove();
    modalOpen = false;
  }

  function showAdminLoginPrompt() {
    try {
      if (document.getElementById('admin-login-prompt')) return;
      const container = document.createElement('div');
      container.id = 'admin-login-prompt';
      container.style.position = 'fixed';
      container.style.right = '16px';
      container.style.bottom = '16px';
      container.style.zIndex = 10000;
      container.style.background = '#fff';
      container.style.border = '1px solid #eee';
      container.style.padding = '12px 14px';
      container.style.borderRadius = '8px';
      container.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
      container.style.fontFamily = 'Arial, sans-serif';
      container.style.fontSize = '14px';

      const txt = document.createElement('div');
      txt.textContent = 'Admin session expired — please log in again to enable notifications.';
      txt.style.marginBottom = '8px';
      container.appendChild(txt);

      const btn = document.createElement('button');
      btn.className = 'btn btn-save';
      btn.textContent = 'Go to Admin Login';
      btn.onclick = () => { window.location.href = '/admin/login.html' };
      btn.style.marginRight = '8px';

      const btnClose = document.createElement('button');
      btnClose.className = 'btn btn-cancel';
      btnClose.textContent = 'Dismiss';
      btnClose.onclick = () => { try { container.remove(); } catch (e) {} };

      container.appendChild(btn);
      container.appendChild(btnClose);
      document.body.appendChild(container);
    } catch (e) { /* ignore errors when showing prompt */ }
  }

  function clearAll() {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
  }

  async function registerAndSubscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // fetch public key
        let pub = null;
        try {
          const isLocal = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.port === '3000');
          const base = isLocal ? 'http://localhost:3000' : '';
          const res = await fetch(base + '/api/push/public-key');
          if (res.ok) {
            const j = await res.json(); pub = j.publicKey || null;
          }
        } catch (e) {}
        if (!pub) return false;
        const toUint8 = (base64String) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4);
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
          return outputArray;
        };
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(pub) });
      }

      // send to server, include a user_type hint (admin pages have body.admin-page)
      try {
        const storedCustomer = JSON.parse(localStorage.getItem('customer')||'{}') || {};
        const email = storedCustomer.email || null;
        const token = localStorage.getItem('auth_token');
        const adminToken = localStorage.getItem('adminToken');
        const isAdminPage = typeof document !== 'undefined' && document.body && document.body.classList && document.body.classList.contains('admin-page');
        const body = { subscription: sub, email, user_type: isAdminPage ? 'admin' : 'customer' };
        const headers = { 'Content-Type': 'application/json' };
        // Prefer adminToken when available on admin pages so server authenticates admin correctly
        let authToken = (isAdminPage && adminToken) ? adminToken : (token || adminToken || null);

        // If admin page and we have an adminToken, verify it first to avoid sending expired tokens
        if (isAdminPage && authToken) {
          try {
            const v = await fetch('/api/admin/verify-token', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: authToken }) });
            if (!v.ok) {
              // token invalid or expired - attempt session refresh via cookie
              const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('connect.sid') !== -1;
              if (hasSessionCookie) {
                try {
                  const r = await fetch('/api/admin/session/refresh', { method: 'POST', credentials: 'include' });
                  if (r.ok) {
                    const j = await r.json();
                    if (j && j.token) {
                      localStorage.setItem('adminToken', j.token);
                      authToken = j.token;
                    } else {
                      // remove stale
                      localStorage.removeItem('adminToken');
                      authToken = null;
                    }
                  } else {
                    localStorage.removeItem('adminToken');
                    authToken = null;
                  }
                } catch (e) { localStorage.removeItem('adminToken'); authToken = null; }
              } else {
                // no session cookie, remove stale token and prompt admin to re-login
                localStorage.removeItem('adminToken');
                authToken = null;
                try { showAdminLoginPrompt(); } catch (e) {}
              }
            }
          } catch (e) {
            // verification failed, be conservative and remove token
            localStorage.removeItem('adminToken');
            authToken = null;
          }
        }

        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        // Attempt register; if 401 and we have a session cookie, try session refresh then retry once
        const doRegister = async (useHeaders) => {
          const isLocal = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.port === '3000');
          const url = (isLocal ? 'http://localhost:3000' : '') + '/api/push/register';
          return fetch(url, { method: 'POST', headers: useHeaders, body: JSON.stringify(body), credentials: 'include' });
        };

        let res = await doRegister(headers);
        if (res && (res.status === 401 || res.status === 403) && isAdminPage) {
          // try to refresh admin session via cookie to obtain an adminToken
          const hasSessionCookie = typeof document !== 'undefined' && document.cookie && document.cookie.indexOf('connect.sid') !== -1;
          if (hasSessionCookie) {
            try {
              const r = await fetch('/api/admin/session/refresh', { method: 'POST', credentials: 'include' });
              if (r.ok) {
                const j = await r.json();
                if (j && j.token) {
                  localStorage.setItem('adminToken', j.token);
                  headers['Authorization'] = `Bearer ${j.token}`;
                  res = await doRegister(headers);
                }
              }
            } catch (e) {
              // ignore refresh errors
            }
          }
          // If still failing and we had an adminToken, remove it (stale/invalid) and retry once without Authorization
          if (authToken) {
            try { localStorage.removeItem('adminToken'); } catch (e) {}
            delete headers['Authorization'];
            res = await doRegister(headers);
          }
        }
        // no throw — failure is non-fatal for the client
        localStorage.setItem('push_subscribed', '1');
      } catch (e) {
        // ignore send errors
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function shouldStart() {
    if (!isLoggedIn()) return false;
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return false;
    if (Notification.permission === 'denied') return false;
    if (localStorage.getItem('notify_prompt_denied')) return false;
    return true;
  }

  function startPromptLoop() {
    if (!shouldStart()) return;
    // show first after a small delay
    setTimeout(() => { if (!modalOpen) createModal(); }, 800);
    intervalId = setInterval(() => { if (!modalOpen && shouldStart()) createModal(); }, INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', () => {
    try { startPromptLoop(); } catch (e) {}
  });
})();
