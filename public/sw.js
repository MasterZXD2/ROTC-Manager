// Service Worker แบบเรียบง่าย — cache shell ของ Next.js
const VERSION = "v4";
const STATIC = `rotc-static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(keys.filter((k) => k.startsWith("rotc-static-") && k !== STATIC).map((k) => caches.delete(k)));
      await self.clients.claim();
    }),
  );
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

  // Cache exact pages for offline use; never substitute another route or cache Next.js navigation payloads.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            event.waitUntil(caches.open(STATIC).then((c) => c.put(req, copy)));
          }
          return res;
        })
        .catch(async () => (await (await caches.open(STATIC)).match(req)) || new Response("ไม่สามารถเปิดหน้านี้ขณะออฟไลน์ กรุณาตรวจการเชื่อมต่อแล้วโหลดใหม่", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
        })),
    );
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then((cache) => cache.match(req)).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok && !res.headers.get("content-type")?.includes("text/html")) {
              const copy = res.clone();
              event.waitUntil(caches.open(STATIC).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});
