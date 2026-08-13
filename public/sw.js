// Service Worker for Push Notifications
const CACHE_NAME = 'chammy-florals-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/styles.css'
];

// Helper: fetch with timeout so install doesn't hang on a slow/blocked request
function fetchWithTimeout(url, opts = {}, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fetch-timeout')), timeout);
    fetch(url, opts).then((r) => {
      clearTimeout(timer);
      resolve(r);
    }).catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

// Helper: promise race with timeout
function promiseTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((res, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
    .catch((err) => {
      if (fallback !== undefined) return fallback;
      throw err;
    });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const url of urlsToCache) {
        try {
          // Use fetchWithTimeout + cache.put so a single slow/failed request doesn't hang install
          const resp = await fetchWithTimeout(url, { cache: 'no-store' }, 3000);
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
          } else {
            console.warn('Service Worker: fetch for caching returned non-ok', url, resp && resp.status);
          }
        } catch (err) {
          console.warn('Service Worker: failed to fetch/cache', url, err && err.message ? err.message : err);
        }
      }
      // Attempt to activate new worker without blocking install
      try { self.skipWaiting(); } catch (e) {}
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    } catch (e) {
      console.warn('Error clearing caches during activate', e && e.message ? e.message : e);
    }
    try {
      await clients.claim();
      // Notify controlled clients that activation is complete so they can proceed
      try {
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        for (const c of allClients) {
          try { c.postMessage({ type: 'ACTIVATED' }); } catch (e) {}
        }
      } catch (e) {
        console.warn('failed to post activation message to clients', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.warn('clients.claim failed', e && e.message ? e.message : e);
    }
  })());
});

// Allow the page to trigger skipWaiting via postMessage when a new SW is installed
self.addEventListener('message', (event) => {
  try {
    const d = event.data || {};
    if (d && d.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  } catch (e) {}
});

// Fetch event
// Important: only handle same-origin GET requests. This prevents the service worker
// from hijacking cross-origin requests (e.g., Google Fonts / Font Awesome) and
// returning cached HTML (which causes MIME type errors).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Let the browser handle cross-origin requests.
    return;
  }

  // Let API requests, js files, and main HTML pages bypass the service worker cache entirely in dev
  if (url.pathname.startsWith('/api/') || url.pathname.endsWith('.js') || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/dashboard.html') {
    event.respondWith(
      fetch(req).catch(() => {
        // Fallback for files if offline
        return caches.match(req);
      })
    );
    return;
  }

  // Never cache JavaScript files - always fetch fresh to prevent stale code
  if (url.pathname.endsWith('.js')) {
    event.respondWith(fetch(req));
    return;
  }

  // For HTML pages and other resources, use network-first strategy
  event.respondWith(
    fetch(req).then((response) => {
      // Clone the response and cache it for offline use
      if (response && response.ok) {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, responseToCache);
        });
      }
      return response;
    }).catch(() => {
      // Only fall back to cache when network fails
      return caches.match(req).then((cached) => {
        if (cached) return cached;
        // Only fall back to index.html for navigation requests
        if (req.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      });
    })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  
  let data = {
    title: 'Chammy Florals',
    body: 'You have a new message',
    icon: '/flowers/cherry-blossom.png',
    badge: '/flowers/cherry-blossom.png',
    tag: 'chat-notification',
    requireInteraction: false,
    data: {}
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const promiseChain = self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    data: data.data,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'view', title: 'View' },
      { action: 'close', title: 'Close' }
    ]
  });

  event.waitUntil(promiseChain);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (let client of clientList) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window
      if (clients.openWindow) {
        const url = event.notification.data?.url || '/';
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline message sending
self.addEventListener('sync', (event) => {
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Sync any pending messages when back online
  
}
