/// <reference lib="webworker" />
// Custom service worker: Workbox precaching/runtime caching (same behavior as
// the previous generateSW config) plus Web Push handlers.

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

// Precache build assets (JS/CSS/icons — NOT HTML; HTML is auth-dependent)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Activate new SW immediately (matches previous registerType: "autoUpdate")
self.skipWaiting();
clientsClaim();

// API calls: network-first, fall back to cache when offline
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/") &&
    request.method === "GET",
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 10,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// Google Fonts: cache long-term
registerRoute(
  ({ url }) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts",
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ── Web Push ──────────────────────────────────────────────────────────────────

self.addEventListener("push", (event: PushEvent) => {
  let data: { title?: string; body?: string; href?: string; actions?: { action: string; title: string }[]; tag?: string } = {};
  try { data = event.data?.json() ?? {}; } catch {}
  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: data.body ?? "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    data: { href: data.href ?? "/" },
  };
  // Action buttons (one-tap habit logging). Unsupported platforms (iOS web
  // push) simply show the notification without buttons.
  if (data.actions?.length) options.actions = data.actions.slice(0, 2);
  if (data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(data.title ?? "MyLifos", options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  // One-tap habit logging: "habit:<id>" action buttons complete the habit for
  // today without opening the app. Session cookie rides along (same-origin).
  if (event.action?.startsWith("habit:")) {
    const habitId = event.action.slice("habit:".length);
    const today = new Date().toLocaleDateString("en-CA");
    event.waitUntil(
      fetch(`/api/habits/${habitId}/complete/${today}`, { method: "POST", credentials: "include" })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return self.registration.showNotification("Logged ✓", {
            body: "Habit checked off for today. Keep the streak going!",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-96x96.png",
            tag: "habit-logged",
            data: { href: "/habits" },
          });
        })
        .catch(() =>
          self.registration.showNotification("Couldn't log habit", {
            body: "Tap to open MyLifos and check it off there.",
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-96x96.png",
            tag: "habit-logged",
            data: { href: "/habits" },
          })
        )
    );
    return;
  }

  const href: string = event.notification.data?.href ?? "/";
  const url = `${self.location.origin}/#${href}`;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          (client as WindowClient).navigate(url);
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
