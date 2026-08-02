/* 透明代理版 Service Worker：
 * 不做任何资源缓存，install/activate 时清空所有旧缓存，
 * 所有请求直接走网络 —— 永远加载最新内容，避免缓存导致的界面异常。
 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  e.respondWith(
    fetch(e.request).catch(function () {
      return new Response('网络不可用，请检查网络后重试', { status: 504, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
