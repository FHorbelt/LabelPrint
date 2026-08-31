// Cache-first fuer die App-Schale. Zur Laufzeit ist kein Netz noetig,
// weil auch die QR-Bibliothek lokal liegt.
// Bei jeder Aenderung an den Dateien die Versionsnummer erhoehen.

const CACHE = 'asn-v3';

const SCHALE = [
  './',
  './index.html',
  './css/app.css',
  './js/main.js',
  './js/ui.js',
  './js/sheet.js',
  './js/presets.js',
  './js/store.js',
  './js/render.js',
  './vendor/qrcode.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SCHALE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((treffer) => treffer || fetch(e.request))
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
