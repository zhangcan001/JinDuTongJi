const CACHE_NAME = "jindu-local-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/data.js",
  "./js/business-rules.js",
  "./js/project-helpers.js",
  "./js/dom.js",
  "./js/validation-schema.js",
  "./js/error-reporting.js",
  "./js/ui-dialogs.js",
  "./js/storage-audit.js",
  "./js/state-import.js",
  "./js/import-loader.js",
  "./js/import-worker.js",
  "./js/dashboard.js",
  "./js/scope-model.js",
  "./js/basement-view.js",
  "./js/progress-chart.js",
  "./js/records-chart.js",
  "./js/main.js",
  "./assets/progress-template.xlsx",
  "./js/vendor/xlsx.full.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/") {
    event.respondWith(networkFirst(event.request, "./index.html"));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request).then((cached) => cached || caches.match(fallbackUrl));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
