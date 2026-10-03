// Neno servis çalışanı (v5)
// Amaçlar:
//  1) Oyun ikinci açılıştan itibaren ANINDA açılsın (ana dosya cihazda saklı)
//  2) Mobil veri HARCANMASIN: her açılışta 14 MB'lık dosyayı yeniden indirmek yerine
//     sadece küçük bir "değişti mi?" sorusu (HEAD) sorulur. Dosya gerçekten
//     değiştiyse yalnızca o zaman, arka planda, BİR KEZ indirilir.
const CACHE_NAME = "neno-cache-v5";
const DOC_KEY = "/index.html";           // ana oyun dosyası tek bir anahtarla saklanır
const SMALL_URLS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];
const META_KEY = "/__neno_meta";         // son güncelleme zamanını tutar
const MIN_RECHECK_MS = 30 * 60 * 1000;   // en az 30 dk arayla tam indirme

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Küçük dosyalar: biri eksik olsa bile kurulum bozulmasın
    await Promise.all(SMALL_URLS.map((u) => cache.add(u).catch(() => {})));
    // Ana dosya: sayfa az önce indirildiği için tarayıcı önbelleğinden alınır
    try {
      const res = await fetch("/", { cache: "force-cache" });
      if (res && res.ok) {
        await cache.put(DOC_KEY, res);
        await touchMeta(cache);
      }
    } catch (e) { /* ağ yoksa sorun değil, ilk gezintide saklanacak */ }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Sayfa açılışı (uygulama başlangıcı)
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  // Diğer küçük dosyalar: önce önbellek, yoksa ağ
  event.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});

async function handleNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(DOC_KEY);
  if (cached) {
    // Anında göster; güncelleme kontrolü arka planda ve çok ucuz (HEAD)
    event.waitUntil(checkForUpdate(cache, cached));
    return cached;
  }
  // Önbellekte yoksa (ilk kez): ağdan getir ve sakla
  try {
    const res = await fetch(event.request);
    if (res && res.ok) {
      const copy = res.clone();
      event.waitUntil(cache.put(DOC_KEY, copy).then(() => touchMeta(cache)));
    }
    return res;
  } catch (e) {
    return new Response("Neno: Mara ya kwanza inahitaji mtandao.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

function cleanTag(v) {
  return v ? v.replace(/^W\//, "").replace(/"/g, "") : null;
}

async function touchMeta(cache) {
  await cache.put(META_KEY, new Response(String(Date.now())));
}

async function checkForUpdate(cache, cached) {
  try {
    // Çok sık tam indirme yapma
    const meta = await cache.match(META_KEY);
    if (meta) {
      const last = parseInt(await meta.text(), 10) || 0;
      if (Date.now() - last < MIN_RECHECK_MS) return;
    }
    // Ucuz soru: dosya değişti mi? (gövde indirilmez)
    const head = await fetch("/", { method: "HEAD", cache: "no-store" });
    if (!head || !head.ok) return;

    const newTag = cleanTag(head.headers.get("etag"));
    const oldTag = cleanTag(cached.headers.get("etag"));
    const newLM = head.headers.get("last-modified");
    const oldLM = cached.headers.get("last-modified");

    let changed = false;
    if (newTag && oldTag) changed = newTag !== oldTag;
    else if (newLM && oldLM) changed = newLM !== oldLM;
    if (!changed) { await touchMeta(cache); return; }

    // Gerçekten değişmiş: yeni sürümü BİR KEZ indir, bir sonraki açılışta devreye girer
    const res = await fetch("/", { cache: "no-store" });
    if (res && res.ok) {
      await cache.put(DOC_KEY, res);
      await touchMeta(cache);
    }
  } catch (e) { /* çevrimdışı vb.: sessizce geç */ }
}
