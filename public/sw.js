// ChainCore Service Worker v2 — offline support + push notifications + background sync
const CACHE_NAME = 'chaincore-v2';
const STATIC_ASSETS = [
  '/',
  '/mobile',
  '/manifest.json',
  '/gyds-coin.jpg',
  '/gyd-coin.png',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Message: allow pages to trigger skipWaiting ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_URLS') {
    caches.open(CACHE_NAME).then((c) => c.addAll(event.data.urls || []));
  }
});

// ── Fetch: stale-while-revalidate for pages, network-first for API ────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Never intercept API calls or WebSocket upgrades
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // For navigation requests (HTML pages): network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached ?? caches.match('/mobile') ?? caches.match('/'))
        )
    );
    return;
  }

  // For static assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      });
      return cached ?? networkFetch;
    })
  );
});

// ── Background Sync: queue failed transactions ────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'gyds-tx-sync') {
    event.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingTransactions() {
  const cache = await caches.open('gyds-pending-tx');
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (req) => {
      const body = await cache.match(req).then((r) => r?.json()).catch(() => null);
      if (!body) return;
      try {
        const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) await cache.delete(req);
      } catch {}
    })
  );
}

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'ChainCore',
    body: 'New notification',
    icon: '/gyds-coin.jpg',
    badge: '/gyds-coin.jpg',
    url: '/',
    tag: 'chaincore-default',
    requireInteraction: false,
  };
  try { data = { ...data, ...event.data.json() }; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: { url: data.url },
      tag: data.tag,
      requireInteraction: data.requireInteraction,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url ?? '/mobile';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) { client.focus(); client.navigate(url); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ── Periodic background sync (balance refresh) ────────────────────────────────
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'gyds-balance-refresh') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'BALANCE_REFRESH' }))
      )
    );
  }
});
