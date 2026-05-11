const CACHE_NAME = "jindu-local-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/data.js",
  "./js/business-rules.js",
  "./js/project-helpers.js",
  "./js/dom.js",
  "./js/ui-dialogs.js",
  "./js/storage-audit.js",
  "./js/state-import.js",
  "./js/import-file-reader.js",
  "./js/import-excel.js",
  "./js/import-worker.js",
  "./js/dashboard.js",
  "./js/scope-model.js",
  "./js/basement-view.js",
  "./js/progress-chart.js",
  "./js/records-chart.js",
  "./js/main.js",
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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
