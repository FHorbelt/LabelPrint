// Prueft die Strategie des Service Workers, ohne Browser: `self` und `caches`
// werden nachgebildet, dann wird sw.js importiert und seine Listener
// aufgerufen. Bisher war diese Logik ueberhaupt nicht abgedeckt — und genau
// dort steckte der Fehler, der die Aktualisierung verschluckt hat.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const listener = {};
const cacheInhalt = new Map();
let letzteCacheNamen = [];

globalThis.self = {
  addEventListener: (typ, fn) => { listener[typ] = fn; },
  clients: { claim: () => Promise.resolve() },
  skipWaiting: () => {}
};

const fakeCache = {
  addAll: (urls) => { urls.forEach((u) => cacheInhalt.set(u, `vorrat:${u}`)); return Promise.resolve(); },
  put: (req, res) => { cacheInhalt.set(req.url ?? req, res); return Promise.resolve(); },
  keys: () => Promise.resolve([...cacheInhalt.keys()])
};

globalThis.caches = {
  open: () => Promise.resolve(fakeCache),
  keys: () => Promise.resolve(letzteCacheNamen),
  delete: (n) => { letzteCacheNamen = letzteCacheNamen.filter((x) => x !== n); return Promise.resolve(true); },
  match: (req) => Promise.resolve(cacheInhalt.get(req.url ?? req))
};

await import('../app/sw.js');

// Ein Ereignis nachbilden und die Antwort einsammeln
function feuere(request) {
  let antwort;
  listener.fetch({ request, respondWith: (p) => { antwort = p; } });
  return antwort;
}
const anfrage = (url, extra = {}) => ({ url, method: 'GET', mode: 'navigate', ...extra });

test('install legt die App-Schale in den Cache', async () => {
  let gewartet;
  listener.install({ waitUntil: (p) => { gewartet = p; } });
  await gewartet;
  assert.ok(cacheInhalt.has('./index.html'), 'index.html fehlt im Vorrat');
  assert.ok(cacheInhalt.has('./js/main.js'), 'main.js fehlt im Vorrat');
  assert.ok(cacheInhalt.has('./vendor/qrcode.min.js'), 'QR-Bibliothek fehlt im Vorrat');
});

test('online gewinnt das Netz, nicht der Cache', async () => {
  cacheInhalt.set('/js/main.js', 'ALT aus dem Cache');
  globalThis.fetch = () => Promise.resolve({
    ok: true, type: 'basic', clone: () => 'FRISCH vom Server', body: 'FRISCH vom Server'
  });
  const res = await feuere(anfrage('/js/main.js'));
  assert.equal(res.body, 'FRISCH vom Server',
    'bei erreichbarem Server muss die Netzantwort gewinnen');
});

test('die frische Antwort landet im Cache fuer spaeter', async () => {
  cacheInhalt.delete('/css/app.css');
  globalThis.fetch = () => Promise.resolve({
    ok: true, type: 'basic', clone: () => 'KOPIE', body: 'FRISCH'
  });
  await feuere(anfrage('/css/app.css'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cacheInhalt.get('/css/app.css'), 'KOPIE');
});

test('offline antwortet der Cache', async () => {
  cacheInhalt.set('/js/sheet.js', 'AUS DEM CACHE');
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  const res = await feuere(anfrage('/js/sheet.js'));
  assert.equal(res, 'AUS DEM CACHE');
});

test('offline und nichts im Cache: Seitenaufruf faellt auf index.html zurueck', async () => {
  cacheInhalt.set('./index.html', 'HUELLE');
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  const res = await feuere(anfrage('/gibtesnicht', { mode: 'navigate' }));
  assert.equal(res, 'HUELLE');
});

test('Fehlerantworten des Servers werden nicht in den Cache uebernommen', async () => {
  cacheInhalt.set('/js/ui.js', 'GUT');
  globalThis.fetch = () => Promise.resolve({
    ok: false, status: 500, type: 'basic', clone: () => 'KAPUTT', body: 'KAPUTT'
  });
  await feuere(anfrage('/js/ui.js'));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cacheInhalt.get('/js/ui.js'), 'GUT', 'eine 500 darf den Vorrat nicht ueberschreiben');
});

test('nur GET wird behandelt', () => {
  let angefasst = false;
  listener.fetch({ request: { url: '/x', method: 'POST' }, respondWith: () => { angefasst = true; } });
  assert.equal(angefasst, false);
});

test('activate raeumt Caches anderer Versionen ab', async () => {
  letzteCacheNamen = ['asn-v1', 'asn-v5', 'asn-v7'];
  let gewartet;
  listener.activate({ waitUntil: (p) => { gewartet = p; } });
  await gewartet;
  assert.deepEqual(letzteCacheNamen, ['asn-v7'], 'nur die aktuelle Version bleibt');
});
