// Giraffe Doom — funciona sem internet depois da primeira visita (contra os bots).
// Rede primeiro: com internet sempre carrega a versão mais nova; sem internet usa a cópia guardada.
const CACHE = 'giraffe-doom-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // Firebase e afins passam direto
  const isImg = /\/img\/|\.woff2$|\.png$/.test(req.url);
  if (isImg) {
    // imagens não mudam: cache primeiro
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
    return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
});
