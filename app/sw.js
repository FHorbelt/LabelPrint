// Netz zuerst, Cache als Rueckfall.
//
// Solange der Server erreichbar ist, siehst du immer den aktuellen Stand; jede
// brauchbare Antwort wandert nebenbei in den Cache. Faellt das Netz aus,
// bedient der Cache — die App bleibt offline vollstaendig benutzbar.
//
// Vorher galt cache-first. Das war beim Laden schneller, hatte aber eine Falle:
// wer die Cache-Version unten nicht mitzog, bekam dauerhaft die alte Fassung
// ausgeliefert, ohne dass irgendetwas darauf hinwies. Genau das ist passiert.
// Die Version dient jetzt nur noch dem Aufraeumen alter Bestaende.

const CACHE = 'asn-v8';

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
  // Vorrat anlegen, damit die App auch beim allerersten Netzausfall laeuft.
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
    fetch(e.request)
      .then((antwort) => {
        // Nur brauchbare Antworten in den Vorrat legen: eine 404 oder 500 darf
        // die gute Kopie nicht ueberschreiben.
        if (antwort && antwort.ok && antwort.type === 'basic') {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() =>
        caches.match(e.request).then((treffer) => {
          if (treffer) return treffer;
          // Offline und nichts Passendes im Vorrat: bei einem Seitenaufruf
          // wenigstens die Huelle ausliefern statt einer Fehlerseite.
          if (e.request.mode === 'navigate') return caches.match('./index.html');
          return undefined;
        })
      )
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
