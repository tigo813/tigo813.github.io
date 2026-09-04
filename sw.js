const CACHE_NAME = "neno-cache-v5";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];
// Kurulum: sadece KÜÇÜK dosyaları önceden kaydet (manifest, ikonlar).
// index.html (~20MB) kurulum anında zorla önbelleğe alınmaya çalışılırsa
// yavaş/dengesiz bağlantıda veya kısıtlı depolamada başarısız olabilir,
// bu da service worker kurulumunun yarım kalmasına ve bir sonraki
// açılışta oyunun hiç açılmamasına sebep olabilir. Bunun yerine
// index.html, aşağıdaki "fetch" olayı sırasında doğal olarak önbelleğe
// alınır (ilk gerçek ziyarette).
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});
// Etkinleştirme: eski önbellek sürümlerini (v1, v2, v3, v4 dahil) temizle
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
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => null);
        // Önbellekte varsa hemen onu döndür, güncelleme arka planda devam eder.
        // Önbellekte yoksa (ilk açılış), internetin gelmesini bekle.
        return cachedResponse || networkFetch;
      })
    ).catch(() => fetch(event.request))
  );
});
