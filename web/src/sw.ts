/// <reference lib="webworker" />
// Service worker: offline app shell, cached photos, and Web Push reminders.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every app URL (/, /morning, /wardrobe …) loads the cached shell.
try {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/photos\//, /^\/healthz/] }));
} catch {
  // dev server: index.html isn't precached
}

// Item photos never change (each upload gets a new name), so serve them from cache.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/photos/'),
  new CacheFirst({ cacheName: 'photos', plugins: [new ExpirationPlugin({ maxEntries: 300 })] }),
);

interface ReminderPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener('push', event => {
  let data: ReminderPayload = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const tag = data.tag || 'morning-reminder';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const foreground = wins.some(c => c.focused && c.visibilityState === 'visible');
    wins.forEach(c => c.postMessage({ type: 'reminder' }));
    // iOS requires every push to show a notification. When the app is open we
    // show it, then close it at once and let the in-app banner take over.
    await self.registration.showNotification(data.title || 'How did they sleep?', {
      body: data.body || 'Tap to rate last night and add the morning room reading.',
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/morning' },
    });
    if (foreground) (await self.registration.getNotifications({ tag })).forEach(n => n.close());
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path: string = event.notification.data?.url || '/morning';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        c.postMessage({ type: 'open', path });
        return;
      }
    }
    await self.clients.openWindow(path);
  })());
});
