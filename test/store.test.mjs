import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../app/js/store.js';

// Minimaler Ersatz fuer localStorage
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

// Speicher, der bei jedem Zugriff wirft (privates Fenster, Kontingent voll)
function brokenStorage() {
  return {
    getItem() { throw new Error('nope'); },
    setItem() { throw new Error('nope'); },
    removeItem() { throw new Error('nope'); }
  };
}

test('leerer Speicher: naechste ASN ist 1', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.nextAsn(), 1);
  assert.deepEqual(s.listRuns(), []);
});

test('Lauf eintragen schreibt den Zaehler fort', () => {
  const s = createStore(fakeStorage());
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 1, to: 189, count: 189, template: 'bogen189' });
  assert.equal(s.nextAsn(), 190);
  assert.equal(s.listRuns().length, 1);
});

test('Zaehler folgt der hoechsten Nummer, nicht der Reihenfolge', () => {
  const s = createStore(fakeStorage());
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 500, to: 520, count: 21, template: 'bogen189' });
  s.addRun({ ts: 2, prefix: 'AR-', suffix: '', from: 1, to: 10, count: 10, template: 'bogen189' });
  assert.equal(s.nextAsn(), 521);
});

test('Rueckgaengig entfernt den letzten Lauf und setzt den Zaehler zurueck', () => {
  const s = createStore(fakeStorage());
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 1, to: 189, count: 189, template: 'bogen189' });
  s.addRun({ ts: 2, prefix: 'AR-', suffix: '', from: 190, to: 378, count: 189, template: 'bogen189' });
  const weg = s.undoLastRun();
  assert.equal(weg.from, 190);
  assert.equal(s.nextAsn(), 190);
  assert.equal(s.listRuns().length, 1);
});

test('Rueckgaengig auf leerer Historie liefert null', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.undoLastRun(), null);
});

test('Historie ist auf 200 Laeufe begrenzt', () => {
  const s = createStore(fakeStorage());
  for (let i = 0; i < 205; i++) {
    s.addRun({ ts: i, prefix: 'AR-', suffix: '', from: i * 10 + 1, to: i * 10 + 10, count: 10, template: 'bogen189' });
  }
  const runs = s.listRuns();
  assert.equal(runs.length, 200);
  assert.equal(runs[runs.length - 1].ts, 204);
});

test('Einstellungen werden gespeichert und gelesen', () => {
  const st = fakeStorage();
  createStore(st).saveSettings({ prefix: 'XY-', count: 42 });
  assert.deepEqual(createStore(st).loadSettings(), { prefix: 'XY-', count: 42 });
});

test('eigene Vorlagen anlegen und loeschen', () => {
  const s = createStore(fakeStorage());
  s.saveUserTemplate({ id: 'u1', name: 'Mein Bogen', pageW: 210, pageH: 297 });
  assert.equal(s.listUserTemplates().length, 1);
  s.saveUserTemplate({ id: 'u1', name: 'Umbenannt', pageW: 210, pageH: 297 });
  assert.equal(s.listUserTemplates().length, 1, 'gleiche id ersetzt statt anzuhaengen');
  assert.equal(s.listUserTemplates()[0].name, 'Umbenannt');
  s.deleteUserTemplate('u1');
  assert.equal(s.listUserTemplates().length, 0);
});

test('defekter Speicher legt nichts lahm', () => {
  const s = createStore(brokenStorage());
  assert.equal(s.isAvailable(), false);
  assert.equal(s.loadSettings(), null);
  assert.deepEqual(s.listRuns(), []);
  assert.equal(s.nextAsn(), 1);
  s.saveSettings({ prefix: 'AR-' });        // darf nicht werfen
  s.addRun({ ts: 1, from: 1, to: 5, count: 5 });
  assert.equal(s.undoLastRun(), null);
});

test('beschaedigter Inhalt wird wie leer behandelt', () => {
  const st = fakeStorage();
  st.setItem('asn.history', '{kein json');
  const s = createStore(st);
  assert.deepEqual(s.listRuns(), []);
  assert.equal(s.nextAsn(), 1);
});
