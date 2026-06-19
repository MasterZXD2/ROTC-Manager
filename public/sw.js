// Service Worker แบบเรียบง่าย — cache shell ของ Next.js
const VERSION = "v3";
const STATIC = `rotc-static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // cache เฉพาะ http/https — กัน chrome-extension://, blob:, data:, ws://
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // อย่า cache Firestore/Functions/Auth — ต้องการข้อมูลสด
  if (
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("firebaseio.com") ||
    url.hostname.endsWith("cloudfunctions.net") ||
    url.hostname.endsWith("identitytoolkit.googleapis.com")
  ) return;

  // ข้าม cross-origin — cache เฉพาะของเว็บเราเอง
  if (url.origin !== self.location.origin) return;

  // Network-first สำหรับ HTML, cache-first สำหรับ assets
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match("/"))),
    );
  } else {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
