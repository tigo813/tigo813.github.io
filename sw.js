const CACHE_NAME = "neno-cache-v3";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Kurulum: oyunun ana dosyalarını cihaza önceden kaydet
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Etkinleştirme: eski önbellek sürümlerini (v1, v2 dahil) temizle
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// İstekleri karşıla: ÖNCE İNTERNETTEN dene (güncel sürümü almak için),
// internet yoksa/başarısız olursa önbellekten göster.
// "cache: no-store" ekledik — bu, tarayıcının kendi (Service Worker'dan
// bağımsız) HTTP önbelleğini de atlamasını garantiliyor, gerçekten
// sunucudan taze veri çeker.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // İnternet yok ve önbellekte de yoksa, sayfa açma isteklerinde
          // en azından ana oyun dosyasını göster
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});
