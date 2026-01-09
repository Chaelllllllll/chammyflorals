// Service Worker for Push Notifications
const CACHE_NAME = 'chammy-florals-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/styles.css'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache).catch(err => {
          console.log('Cache addAll error:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => clients.claim())
  );
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
