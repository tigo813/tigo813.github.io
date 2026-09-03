const CACHE_NAME = "neno-cache-v4";
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

// Etkinleştirme: eski önbellek sürümlerini (v1, v2, v3 dahil) temizle
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// İstekleri karşıla: ÖNCE ÖNBELLEKTEN hemen göster (uygulama anında açılsın),
// AYNI ANDA arka planda internetten güncel sürümü indirip önbelleği
// sessizce yeniler ("stale-while-revalidate"). Böylece:
//  - Oyuncu her açılışta bekletilmez, önbellekte ne varsa anında gösterilir
//  - Güncellemeler kaybolmaz: arka planda indirilen yeni sürüm önbelleğe
//    yazılır, bir SONRAKİ açılışta devreye girer
//  - Hiç önbellek yoksa (ilk kurulum / hiç internet + hiç önbellek yoksa
//    ilk açılış) normal şekilde internetten çekilir
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request, { cache: "no-store" })
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => null);

        // Önbellekte varsa hemen onu döndür, güncelleme arka planda devam eder.
        // Önbellekte yoksa (ilk açılış), internetin gelmesini bekle.
        return cachedResponse || networkFetch;
      })
    )
  );
});
