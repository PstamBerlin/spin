/* Spin offline shell. Online: the fresh files from the network. Offline: the last copy that was fetched.
   VERSION is written by tools/stamp.py from the site's contents, so every deploy renews the offline copy. */
const VERSION = "spin-105c6e66";
const SHELL = ["./", "./index.html", "./style.css", "./glass.css", "./app.js", "./qrcode.js", "./icon.svg", "./manifest.webmanifest",
  "./fonts/Manrope-500.woff2", "./fonts/Manrope-700.woff2", "./fonts/Manrope-800.woff2", "./fonts/Unbounded-500.woff2", "./fonts/Unbounded-800.woff2"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION)
    // all or nothing: if one file cannot be fetched the install fails, and the old worker keeps its complete copy
    .then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: "reload" }).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return c.put(u, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return res; })
      // offline: the exact address first (app.js?v=... is the right version), then the same file under any version
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match(e.request, { ignoreSearch: true })).then((hit) => hit || caches.match("./index.html")))
  );
});
