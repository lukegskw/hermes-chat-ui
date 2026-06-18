const CACHE_NAME = 'hermes-chat-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.png',
];

// Install Event - Pre-cache essential static shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate caching strategy
self.addEventListener('fetch', (event) => {
  // Only handle standard HTTP/HTTPS GET requests
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Do not intercept or cache Hermes API endpoints or hot module reloading dev routes
  if (event.request.url.includes('/api/') || event.request.url.includes('/v1/') || event.request.url.includes('/@vite/') || event.request.url.includes('node_modules')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Cache successful responses for future offline requests
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
          console.warn('[Service Worker] Fetch failed, serving cached fallback:', err);
          return cachedResponse;
        });

        // Return cached shell resource immediately, revalidating in the background
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Push Notification Event
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hermes',
    body: 'You have a new message',
    icon: '/icon.png',
    url: '/',
    tag: 'hermes-message',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('[Service Worker] Push event error:', e);
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon.png',
    badge: '/icon.png',
    tag: data.tag || 'hermes-message',
    data: { url: data.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Check if any window is currently focused
      for (const client of clients) {
        if (client.focused) {
          // App is open and focused, no need to show a push notification
          return;
        }
      }
      return self.registration.showNotification(data.title, options);
    })
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
