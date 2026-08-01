var CACHE = 'smwb-v2';
var ASSETS = [
  '.',
  'index.html',
  'styles.css',
  'app.js',
  'seed.js',
  'vendor/xlsx.full.min.js',
  'icon.svg',
  'manifest.webmanifest'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  // 实时榜单接口与本地榜单文件：永远走网络，不缓存（避免拿到旧数据）
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/hot-videos.json') === 0) {
    e.respondWith(fetch(e.request).catch(function () { return new Response('', { status: 504 }); }));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var cp = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cp); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
