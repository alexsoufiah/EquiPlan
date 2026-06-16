// EquiPlan Service Worker — Push + Offline-Cache
const CACHE = "equiplan-v1";
const APP_SHELL = ["/", "/manifest.json", "/logo.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nie POST/PUT/DELETE cachen
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // nur eigene Domain

  // SSE-Stream nie abfangen
  if (url.pathname === "/api/events") return;

  // Seitennavigation: erst Netz, bei Offline gecachte App-Shell ("/")
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((r) => r || caches.match(request)))
    );
    return;
  }

  // Zeitplan + Verspätungen: Netz zuerst, Antwort cachen, offline aus Cache
  if (url.pathname === "/api/schedule" || url.pathname === "/api/delays") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Übrige statische Ressourcen: Cache zuerst, sonst Netz (und nachladen)
  if (url.pathname.startsWith("/_next/") || APP_SHELL.includes(url.pathname) || url.pathname.endsWith(".png") || url.pathname.endsWith(".svg")) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }).catch(() => cached)
      )
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || "EquiPlan", {
      body: data.body || "",
      icon: data.icon || "/icon-192.png",
      badge: "/icon-192.png",
      tag: "equiplan-update",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
