// Service worker: lets the app open offline and makes it installable.
// Pages and code are fetched fresh when online (so updates show up right
// away) and served from the cache when offline.
const CACHE = "semester-v1";
const SHELL = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/config.js", "js/terms.js", "js/store.js", "js/upload.js", "js/demo.js", "js/engine.js",
  "js/app.js", "js/sync.js", "js/install.js", "js/setup.js",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png", "assets/logo-128.png", "assets/favicon-64.png", "assets/qr-site.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Only this site's own files. Sign-in, sync and uploads always go to the network.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
