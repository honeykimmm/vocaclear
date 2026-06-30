/* ============================================
   Voca Clear 서비스 워커
   - 앱 셸(HTML/CSS/JS/단어데이터)은 캐시 우선
   - 처음 1회 접속 시 전체 캐싱, 이후 완전 오프라인 사용 가능
   - Firebase/외부 폰트는 네트워크 우선, 실패 시 캐시 fallback
   ============================================ */

const CACHE_NAME = "vocaclear-v1";

// 오프라인 핵심 동작(단어목록/플래시카드/타이핑테스트)에 필요한 파일
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./voca_data.js",
  "./firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isCoreAsset = url.origin === self.location.origin;

  if (isCoreAsset) {
    // 앱 셸: 캐시 우선, 없으면 네트워크 후 캐시에 저장
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => caches.match("./index.html"));
      })
    );
  } else {
    // 외부 리소스(폰트, Firebase SDK 등): 네트워크 우선, 실패 시 캐시
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
