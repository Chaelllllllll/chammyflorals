// Service Worker for PWA functionality
// Handles caching, offline support, and push notifications

const CACHE_NAME = 'chammy-florals-v1';
const urlsToCache = [
  '/mobile/',
  '/mobile/index.html',
  '/flowers/cherry-blossom.png',
  '/flowers/logo.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('Push notification received', event);
  
  let notificationData = {
    title: 'Chammy Florals',
    body: 'New notification',
    icon: '/flowers/cherry-blossom.png',
    badge: '/flowers/cherry-blossom.png',
    data: {
      url: '/mobile/'
    }
  };

  // Parse push data if available
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || 'Chammy Florals',
        body: data.body || data.message || 'New notification',
        icon: data.icon || '/flowers/cherry-blossom.png',
        badge: data.badge || '/flowers/cherry-blossom.png',
        image: data.image,
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
        data: data.data || { url: '/mobile/' }
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      image: notificationData.image,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      actions: notificationData.actions,
      data: notificationData.data
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();

  // Handle action buttons
  if (event.action) {
    console.log('Action clicked:', event.action);
    // Handle specific actions here
  }

  // Open the app
  const urlToOpen = event.notification.data?.url || '/mobile/';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((windowClients) => {
      // Check if there's already a window open
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync event (for sending data when connection is restored)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // Implement order syncing logic here
  console.log('Syncing orders in background');
}
