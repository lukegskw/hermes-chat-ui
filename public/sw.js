const CACHE_NAME = 'hermes-chat-cache-v6';
const BADGE_DATABASE = 'hermes-chat-badge';
const BADGE_DATABASE_VERSION = 2;
const BADGE_STORE = 'state';
const BADGE_KEY = 'unread-responses';
const NAVIGATION_STORE = 'navigation';
const NAVIGATION_KEY = 'pending-session';
const MAX_SEEN_NOTIFICATION_IDS = 100;
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

const openBadgeDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(BADGE_DATABASE, BADGE_DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(BADGE_STORE)) {
      request.result.createObjectStore(BADGE_STORE);
    }
    if (!request.result.objectStoreNames.contains(NAVIGATION_STORE)) {
      request.result.createObjectStore(NAVIGATION_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readBadgeState = async () => {
  const database = await openBadgeDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(BADGE_STORE, 'readonly').objectStore(BADGE_STORE).get(BADGE_KEY);
      request.onsuccess = () => resolve(request.result || { count: 0, seenIds: [] });
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
};

const writePendingSessionTarget = async (sessionId, clickedAt = Date.now()) => {
  if (!sessionId) return;
  const database = await openBadgeDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(NAVIGATION_STORE, 'readwrite');
      transaction.objectStore(NAVIGATION_STORE).put({ sessionId, clickedAt }, NAVIGATION_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

const writeBadgeState = async (state) => {
  const database = await openBadgeDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(BADGE_STORE, 'readwrite');
      transaction.objectStore(BADGE_STORE).put(state, BADGE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

const clearAppBadge = async () => {
  try {
    const state = await readBadgeState();
    await writeBadgeState({ ...state, count: 0 });
  } catch (error) {
    console.warn('[Service Worker] Could not persist badge reset:', error);
  }
  try {
    if (typeof self.navigator.clearAppBadge === 'function') {
      await self.navigator.clearAppBadge();
    }
  } catch (error) {
    console.warn('[Service Worker] Could not clear app badge:', error);
  }
};

const incrementAppBadge = async (notificationId) => {
  try {
    const state = await readBadgeState();
    const seenIds = Array.isArray(state.seenIds) ? state.seenIds : [];
    if (notificationId && seenIds.includes(notificationId)) return false;
    const nextState = {
      count: Math.max(0, Number(state.count) || 0) + 1,
      seenIds: notificationId
        ? [...seenIds, notificationId].slice(-MAX_SEEN_NOTIFICATION_IDS)
        : seenIds,
    };
    await writeBadgeState(nextState);
    if (typeof self.navigator.setAppBadge === 'function') {
      await self.navigator.setAppBadge(nextState.count);
    }
    return true;
  } catch (error) {
    console.warn('[Service Worker] Could not update app badge:', error);
    return true;
  }
};

// Push Notification Event
self.addEventListener('push', (event) => {
  let data = {
    title: 'Hermes',
    body: 'You have a new message',
    icon: '/icon.png',
    url: '/',
    tag: 'hermes-message',
    notification_id: null,
    session_id: null,
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
    data: { url: data.url || '/', session_id: data.session_id || null },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.some((client) => client.visibilityState === 'visible' || client.focused)) return;
    const shouldNotify = data.notification_id
      ? await incrementAppBadge(data.notification_id)
      : true;
    if (shouldNotify) await self.registration.showNotification(data.title, options);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'clear-app-badge') event.waitUntil(clearAppBadge());
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const parsedTarget = new URL(url, self.location.origin);
  const targetUrl = parsedTarget.origin === self.location.origin
    ? parsedTarget.href
    : new URL('/', self.location.origin).href;
  const sessionId = event.notification.data?.session_id || parsedTarget.searchParams.get('session') || '';
  const clickedAt = Date.now();

  event.waitUntil((async () => {
    try {
      await writePendingSessionTarget(sessionId, clickedAt);
    } catch (error) {
      console.warn('[Service Worker] Could not persist notification target:', error);
    }
    await clearAppBadge();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClients = clients.filter((client) => client.url.includes(self.location.origin));
    if (sessionId) {
      for (const client of appClients) {
        client.postMessage({ type: 'open-session', sessionId, clickedAt });
      }
    }
    const client = appClients.find((candidate) => 'focus' in candidate);
    if (client) {
      if (!sessionId && 'navigate' in client) {
        const navigated = await client.navigate(targetUrl);
        return (navigated || client).focus();
      }
      return client.focus();
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
