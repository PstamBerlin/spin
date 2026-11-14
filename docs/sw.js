/* Spin offline shell: cache first, refresh in the background. */
const VERSION = "spin-v1";
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./qrcode.js", "./icon.svg", "./manifest.webmanifest",
  "./fonts/Manrope-500.woff2", "./fonts/Manrope-700.woff2", "./fonts/Manrope-800.woff2", "./fonts/Unbounded-500.woff2", "./fonts/Unbounded-800.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => {
    const net = fetch(e.request).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  }));
});
