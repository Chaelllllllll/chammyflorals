// Service Worker for Push Notifications
const CACHE_NAME = 'chammy-florals-v1';
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
  console.log('Service Worker installing...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('Service Worker: Caching files (individual add)');
      for (const url of urlsToCache) {
        try {
          // Use fetchWithTimeout + cache.put so a single slow/failed request doesn't hang install
          const resp = await fetchWithTimeout(url, { cache: 'no-store' }, 3000);
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
            console.log('Cached:', url);
          } else {
            console.warn('Service Worker: fetch for caching returned non-ok', url, resp && resp.status);
          }
        } catch (err) {
          console.warn('Service Worker: failed to fetch/cache', url, err && err.message ? err.message : err);
        }
      }
      // Ensure the new worker activates promptly. Await skipWaiting with a
      // short timeout fallback so install doesn't hang if skipWaiting stalls.
      try {
        await promiseTimeout(self.skipWaiting(), 2000, null);
      } catch (e) {
        console.warn('skipWaiting failed or timed out', e);
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil((async () => {
    console.log('Activate: begin');
    try {
      console.log('Activate: listing caches');
      const cacheNames = await caches.keys();
      console.log('Activate: found caches', cacheNames);
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
      console.log('Activate: cache cleanup complete');
    } catch (e) {
      console.warn('Error clearing caches during activate', e && e.message ? e.message : e);
    }

    try {
      console.log('Activate: calling clients.claim()');
      await clients.claim();
      console.log('Activate: clients.claim() resolved');
      // Notify controlled clients that activation is complete so they can proceed
      try {
        console.log('Activate: matching clients to notify');
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        console.log('Activate: matched clients count', allClients && allClients.length);
        for (const c of allClients) {
          try { c.postMessage({ type: 'ACTIVATED' }); } catch (e) { console.warn('postMessage to client failed', e); }
        }
        console.log('Activate: posted ACTIVATED to clients');
      } catch (e) {
        console.warn('failed to post activation message to clients', e && e.message ? e.message : e);
      }
    } catch (e) {
      console.warn('clients.claim failed', e && e.message ? e.message : e);
    }

    console.log('Activate: end');
  })());
});

// Allow the page to trigger skipWaiting via postMessage when a new SW is installed
self.addEventListener('message', (event) => {
  try {
    const d = event.data || {};
    if (d && d.type === 'SKIP_WAITING') {
      console.log('Service Worker received SKIP_WAITING message');
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

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req);
    }).catch(() => {
      // Only fall back for navigations.
      if (req.mode === 'navigate') return caches.match('/index.html');
      return Response.error();
    })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);
  
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
  console.log('Notification clicked:', event);
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
  console.log('Background sync:', event);
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  // Sync any pending messages when back online
  console.log('Syncing messages...');
}
