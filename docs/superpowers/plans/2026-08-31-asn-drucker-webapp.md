# ASN-Drucker Webapp — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den eindateiigen Etiketten-Generator in eine installierbare, offline
lauffähige Webapp mit ASN-Zähler, eigenen Bogenvorlagen und Druckverlauf
umbauen, ohne die vermessene Druckgeometrie zu verändern.

**Architecture:** Statische Dateien ohne Build-Schritt. Sieben ES-Module mit je
einer Aufgabe: `sheet.js` rechnet (kein DOM, in Node testbar), `render.js`
zeichnet, `print.js` druckt, `store.js` kennt als Einziges `localStorage`,
`presets.js` verwaltet Vorlagen, `ui.js` verbindet Formular und Zustand,
`main.js` verdrahtet. Ein Service Worker legt die App-Schale in einen
versionierten Cache.

**Tech Stack:** Vanilla JavaScript (ES-Module), CSS Custom Properties,
Service Worker, Web App Manifest, `qrcode-generator` 1.4.4 (lokal unter
`vendor/`), `node:test` für die Unit-Tests, Headless Chrome für die
Druckabnahme.

**Spec:** `docs/superpowers/specs/2026-08-31-asn-drucker-webapp-design.md`

## Global Constraints

- **Kein Build-Schritt.** Keine Bundler, keine Transpilation, keine
  Laufzeitabhängigkeit auf `node_modules`. Deployment ist „Ordner kopieren".
- **Keine Netzwerkzugriffe zur Laufzeit.** Kein CDN. Die QR-Bibliothek liegt
  unter `app/vendor/qrcode.min.js`.
- **Deployable Wurzel ist `app/`.** Die Spec listet den Baum unter
  `asn-drucker/`; im Repository heißt er `app/`, damit der Webserver genau
  diesen Ordner ausliefern kann und `docs/` sowie die Altdatei nicht öffentlich
  werden.
- **Alle Maße in Millimetern.** Umrechnung nur dort, wo der Browser sie
  erzwingt.
- **Oberfläche auf Deutsch.**
- **Node 18 oder neuer** für `node --test` (nur Entwicklung, nicht Laufzeit).
- **Die Geometrie ist unveränderlich.** Für die Vorlage HERMA 4243/4244/4333
  gilt verbindlich: Raster 7 × 27 = 189, Etikett 25,4 × 10 mm, Teilung
  27,9 / 10,0 mm, Abstände 2,5 / 0 mm, erste Etikettenecke 8,60 / 13,50 mm,
  letzte 201,40 / 283,49 mm, Ränder außen 8,60 mm seitlich und 13,50 mm
  oben/unten, Eckenradius 1,1 mm, Kontur `#6F6E6E` bei 0,3 mm,
  Seitenbox `@page{size:210mm 297mm; margin:0;}`.
- **Commit nach jeder Aufgabe.** Kleine Commits, aussagekräftige Nachrichten.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `app/index.html` | Markup: Kopfzeile, Seitenleiste mit vier Gruppen, Vorschaubereich |
| `app/css/app.css` | Design-Tokens, Hell/Dunkel, Layout, Bedienelemente |
| `app/js/sheet.js` | `computeLayout`, `pageRule`, `sheetCSS` — rein rechnend |
| `app/js/presets.js` | `DEFAULTS`, `BUILTIN`, Vorlagenliste, Anwenden |
| `app/js/store.js` | `localStorage`: Einstellungen, Vorlagen, Verlauf, Zähler |
| `app/js/render.js` | Bogen zeichnen, QR mit Cache, Zeitscheiben, Abbruch |
| `app/js/print.js` | Druckdokument bauen und in neuem Tab öffnen |
| `app/js/ui.js` | Formular ↔ Einstellungsobjekt, Gruppen, Validierung |
| `app/js/main.js` | Start und Verdrahtung |
| `app/vendor/qrcode.min.js` | QR-Bibliothek, lokal |
| `app/sw.js` | Service Worker, versionierter Cache |
| `app/manifest.webmanifest` | Installierbarkeit |
| `app/icons/*.png` | 192, 512, maskierbar 512 |
| `test/geometry.test.mjs` | Abnahmewerte der Geometrie |
| `test/store.test.mjs` | Zähler, Verlauf, Rückgängig, Ausfall von localStorage |
| `test/print-check.mjs` | Druckabnahme über Headless Chrome |

---

### Task 1: Geometriekern mit festgeschriebenen Abnahmewerten

Zuerst die Tests, dann das Modul. Die Werte stammen aus der Vermessung der
HERMA-Vorlage und sind das Sicherheitsnetz für den gesamten weiteren Umbau.

**Files:**
- Create: `test/geometry.test.mjs`
- Create: `app/js/sheet.js`
- Create: `app/js/presets.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `computeLayout(input) -> Layout` aus `app/js/sheet.js`
  - `pageRule(L) -> string`, `sheetCSS(L) -> string` aus `app/js/sheet.js`
  - `DEFAULTS -> Settings`, `BUILTIN -> {id: Template}` aus `app/js/presets.js`
  - `Layout` hat die Felder `pageW, pageH, secW, secH, secRows, secGapY, labW,
    labH, gapX, gapY, cols, rows, freeW, freeH, marginLeft, marginTop,
    safeMargin, fitPrintable, inkLeft, inkRight, inkTop, inkBottom, perSection,
    perPage`

- [ ] **Step 1: Test-Datei anlegen**

Erstelle `test/geometry.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, pageRule, sheetCSS } from '../app/js/sheet.js';
import { DEFAULTS, BUILTIN } from '../app/js/presets.js';

const nah = (ist, soll, tol = 0.01) =>
  assert.ok(Math.abs(ist - soll) <= tol, `${ist} weicht von ${soll} um mehr als ${tol} ab`);

const mit = (id) => ({ ...DEFAULTS, ...BUILTIN[id] });

test('HERMA-Vorlage ergibt 7 x 27 = 189 Etiketten', () => {
  const L = computeLayout(mit('herma4333'));
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 27);
  assert.equal(L.perSection, 189);
  assert.equal(L.perPage, 189);
});

test('HERMA-Vorlage: Aussenraender 8,60 und 13,50 mm', () => {
  const L = computeLayout(mit('herma4333'));
  nah(L.inkLeft, 8.6);
  nah(L.inkRight, 8.6);
  nah(L.inkTop, 13.5);
  nah(L.inkBottom, 13.5);
});

test('HERMA-Vorlage: erste und letzte Etikettenecke', () => {
  const s = mit('herma4333');
  const L = computeLayout(s);
  const ersteLinks = L.marginLeft + L.freeW / 2;
  const ersteOben  = L.marginTop  + L.freeH / 2;
  nah(ersteLinks, 8.6);
  nah(ersteOben, 13.5);

  const letzteRechts = ersteLinks + (L.cols - 1) * (L.labW + L.gapX) + L.labW;
  const letzteUnten  = L.marginTop + (L.secRows - 1) * (L.secH + L.secGapY)
                     + L.freeH / 2 + (L.rows - 1) * (L.labH + L.gapY) + L.labH;
  nah(letzteRechts, 201.4);
  nah(letzteUnten, 283.5);
});

test('HERMA-Vorlage: Teilung 27,9 und 10,0 mm', () => {
  const s = mit('herma4333');
  nah(s.labW + s.gapX, 27.9);
  nah(s.labH + s.gapY, 10.0);
});

test('Seitenbox folgt den Seitenmassen, nicht fest A4', () => {
  const L1 = computeLayout(mit('herma4333'));
  assert.equal(pageRule(L1), '@page{size:210mm 297mm; margin:0;}');

  const L2 = computeLayout({ ...mit('herma4333'), pageH: 148, secH: 140, secRows: 1 });
  assert.equal(pageRule(L2), '@page{size:210mm 148mm; margin:0;}');
});

test('Alter Bogen mit 4 Abschnitten bleibt 8 x 7 = 224', () => {
  const L = computeLayout(mit('bogen4'));
  assert.equal(L.cols, 8);
  assert.equal(L.rows, 7);
  assert.equal(L.perPage, 224);
  nah(L.inkLeft, 2.35);
  nah(L.inkTop, 2.35);
});

test('Einpassen mit 4,2 mm reduziert den alten Bogen auf 7 x 6', () => {
  const L = computeLayout({ ...mit('bogen4'), fitPrintable: true, safeMargin: 4.2 });
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 6);
  assert.ok(Math.min(L.inkLeft, L.inkRight, L.inkTop, L.inkBottom) >= 4.2);
});

test('Einpassen bleibt wirkungslos, wenn schon genug Rand da ist', () => {
  const L = computeLayout({ ...mit('herma4333'), fitPrintable: true, safeMargin: 4.2 });
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 27);
});

test('Manuelle Raender ueberschreiben das Zentrieren', () => {
  const L = computeLayout({ ...mit('herma4333'), autoCenter: false, marginLeft: 5, marginTop: 20 });
  assert.equal(L.marginLeft, 5);
  assert.equal(L.marginTop, 20);
});

test('Druck-Stylesheet enthaelt die entscheidenden Regeln', () => {
  const css = sheetCSS(computeLayout(mit('herma4333')));
  assert.match(css, /\.page-frame ~ \.page-frame\{break-before:page/);
  assert.match(css, /\.section-outline\{position:absolute; border:none;\}/);
  assert.match(css, /\.safe-area\{display:none;\}/);
  assert.match(css, /\.label\.frame\{outline:0\.3mm solid #000; outline-offset:-0\.15mm;\}/);
  assert.match(css, /@page\{size:210mm 297mm; margin:0;\}/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/geometry.test.mjs`
Expected: FAIL — `Cannot find module '.../app/js/sheet.js'`

- [ ] **Step 3: `app/js/presets.js` anlegen**

```js
// Voreinstellungen und mitgelieferte Bogenvorlagen.
// Die Werte der HERMA-Vorlage sind aus der PDF-Stanzvorlage ausgemessen.

export const DEFAULTS = {
  // Bogen
  pageW: 210, pageH: 297,
  secW: 192.8, secH: 270, secRows: 1, secGapY: 0,
  autoCenter: true, marginLeft: 1, marginTop: 1.25,
  safeMargin: 4.2, fitPrintable: false, showGuides: true,
  // Etikett
  labW: 25.4, labH: 10, gapX: 2.5, gapY: 0,
  labRadius: 1.1, qrPad: 0.6,
  fontSize: 2.5, prefixFontSize: 1.8,
  // Nummernkreis
  prefix: 'AR-', suffix: '', startNum: 1, padDigits: 6,
  qrTemplate: '{nr}', count: 189,
  // Darstellung
  showText: true, stackPrefix: true, showBorder: false
};

export const BUILTIN = {
  herma4333: {
    id: 'herma4333',
    name: 'HERMA 4243/4244/4333 — 25,4 × 10 mm, 189 Stück',
    pageW: 210, pageH: 297,
    secW: 192.8, secH: 270, secRows: 1, secGapY: 0,
    labW: 25.4, labH: 10, gapX: 2.5, gapY: 0,
    labRadius: 1.1,
    autoCenter: true, count: 189
  },
  bogen4: {
    id: 'bogen4',
    name: 'Bogen 4 × 208 × 73,5 mm',
    pageW: 210, pageH: 297,
    secW: 208, secH: 73.5, secRows: 4, secGapY: 0,
    labW: 25.4, labH: 10, gapX: 0.3, gapY: 0.3,
    labRadius: 0,
    autoCenter: true, count: 224
  }
};

// Felder, die eine Vorlage festlegt. Alles andere bleibt beim Wechsel stehen.
export const TEMPLATE_FIELDS = [
  'pageW', 'pageH', 'secW', 'secH', 'secRows', 'secGapY',
  'labW', 'labH', 'gapX', 'gapY', 'labRadius', 'autoCenter', 'count'
];

export function applyTemplate(settings, template) {
  const out = { ...settings };
  for (const k of TEMPLATE_FIELDS) {
    if (k in template) out[k] = template[k];
  }
  return out;
}
```

- [ ] **Step 4: `app/js/sheet.js` anlegen**

Wörtlich die bestehende Rechnung, nur die Eingabe kommt jetzt als Objekt statt
aus dem DOM:

```js
// Geometrie des Etikettenbogens. Rein rechnend, kein DOM — deshalb in Node
// testbar. Die Zahlen dieser Datei sind gegen die HERMA-Stanzvorlage vermessen;
// Aenderungen hier muessen test/geometry.test.mjs bestehen.

const n = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
};

export function computeLayout(s) {
  const pageW = n(s.pageW), pageH = n(s.pageH);
  const secW = n(s.secW), secH = n(s.secH);
  const secRows = Math.max(1, parseInt(s.secRows, 10) || 1);
  const secGapY = n(s.secGapY);
  const labW = n(s.labW), labH = n(s.labH);
  const gapX = n(s.gapX), gapY = n(s.gapY);

  const safeMargin = n(s.safeMargin);
  const fitPrintable = !!s.fitPrintable;

  const totalSectionsH = secRows * secH + (secRows - 1) * secGapY;

  // Die Raender haengen nicht von cols/rows ab, koennen also vorab feststehen.
  let marginLeft, marginTop;
  if (s.autoCenter) {
    marginLeft = (pageW - secW) / 2;
    marginTop = (pageH - totalSectionsH) / 2;
  } else {
    marginLeft = n(s.marginLeft);
    marginTop = n(s.marginTop);
  }

  // Abstand der aeussersten Etikettenkante zum Blattrand, je nach Spalten/Zeilen.
  const inkX = (k) => {
    const w = k * labW + (k - 1) * gapX;
    const left = marginLeft + (secW - w) / 2;
    return { left, right: pageW - (left + w), used: w };
  };
  const inkY = (k) => {
    const h = k * labH + (k - 1) * gapY;
    const top = marginTop + (secH - h) / 2;
    return { top, bottom: pageH - (marginTop + totalSectionsH - (secH - h) / 2), used: h };
  };

  let cols = Math.max(1, Math.floor((secW + gapX) / (labW + gapX)));
  let rows = Math.max(1, Math.floor((secH + gapY) / (labH + gapY)));

  // Spalten/Zeilen so weit reduzieren, bis alles im bedruckbaren Bereich liegt.
  if (fitPrintable && safeMargin > 0) {
    while (cols > 1) {
      const m = inkX(cols);
      if (Math.min(m.left, m.right) >= safeMargin) break;
      cols--;
    }
    while (rows > 1) {
      const m = inkY(rows);
      if (Math.min(m.top, m.bottom) >= safeMargin) break;
      rows--;
    }
  }

  const mx = inkX(cols), my = inkY(rows);
  const freeW = Math.max(0, secW - mx.used);
  const freeH = Math.max(0, secH - my.used);

  return {
    pageW, pageH, secW, secH, secRows, secGapY,
    labW, labH, gapX, gapY, cols, rows,
    freeW, freeH, marginLeft, marginTop,
    safeMargin, fitPrintable,
    inkLeft: mx.left, inkRight: mx.right, inkTop: my.top, inkBottom: my.bottom,
    perSection: cols * rows,
    perPage: cols * rows * secRows
  };
}

export function pageRule(L) {
  return `@page{size:${L.pageW}mm ${L.pageH}mm; margin:0;}`;
}

export function sheetCSS(L) {
  return `
    *{box-sizing:border-box;}
    body{margin:0;background:#fff;}
    .pages-wrap{display:block;}
    .page-frame{position:relative; background:#fff; margin:0;}
    /* Umbruch nur ZWISCHEN Bogen; zwischen zwei .page-frame steht die
       .page-caption, deshalb ~ statt +. Ein break-after auf dem letzten
       Bogen erzeugt in WebKit eine leere Folgeseite. */
    .page-frame ~ .page-frame{break-before:page; page-break-before:always;}
    .page-caption{display:none;}
    .safe-area{display:none;}
    .section-outline{position:absolute; border:none;}
    .label{
      position:absolute;
      background:#fff;
      display:flex;
      align-items:center;
      overflow:hidden;
      outline:none;
    }
    .label.frame{outline:0.3mm solid #000; outline-offset:-0.15mm;}
    .label .qr{flex:0 0 auto;display:flex;align-items:center;justify-content:center;}
    .label .txt{
      flex:1;display:flex;align-items:center;justify-content:center;
      font-family:"Consolas","Courier New",monospace;font-weight:600;
      line-height:1;letter-spacing:.2px;white-space:nowrap;overflow:hidden;
    }
    .label .txt.stacked{flex-direction:column;align-items:center;justify-content:center;gap:0.4mm;}
    .label .txt .prefix-line{font-weight:500;letter-spacing:.4px;line-height:1;}
    .label .txt .number-line{font-weight:700;line-height:1;}
    ${pageRule(L)}
  `;
}

// Seriennummer eines Etiketts. i ist der Index ab 0.
export function buildParts(s, i) {
  const prefix = String(s.prefix ?? '');
  const suffix = String(s.suffix ?? '');
  const start = parseInt(s.startNum, 10) || 0;
  const pad = Math.max(1, parseInt(s.padDigits, 10) || 1);
  const num = (start + i).toString().padStart(pad, '0');
  const numberPart = `${num}${suffix}`;
  return { prefix, numberPart, full: `${prefix}${numberPart}` };
}
```

- [ ] **Step 5: Tests laufen lassen, alle grün**

Run: `node --test test/geometry.test.mjs`
Expected: PASS — 10 Tests bestanden

- [ ] **Step 6: Commit**

```bash
git add app/js/sheet.js app/js/presets.js test/geometry.test.mjs
git commit -m "feat: Geometriekern als Modul mit festgeschriebenen Abnahmewerten"
```

---

### Task 2: Datenhaltung — Einstellungen, Verlauf, Zähler

**Files:**
- Create: `test/store.test.mjs`
- Create: `app/js/store.js`

**Interfaces:**
- Consumes: nichts
- Produces: `createStore(storage) -> Store` aus `app/js/store.js` mit den
  Methoden `isAvailable() -> boolean`, `loadSettings() -> object|null`,
  `saveSettings(s) -> void`, `listRuns() -> Run[]`, `addRun(run) -> void`,
  `undoLastRun() -> Run|null`, `nextAsn() -> number`,
  `listUserTemplates() -> Template[]`, `saveUserTemplate(t) -> void`,
  `deleteUserTemplate(id) -> void`, `loadUi() -> object`, `saveUi(u) -> void`.
  `Run` ist `{ ts, prefix, suffix, from, to, count, template }`.

- [ ] **Step 1: Test-Datei anlegen**

`storage` wird hereingereicht, damit der Test ohne Browser läuft und der
Ausfall von `localStorage` prüfbar ist.

```js
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
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 1, to: 189, count: 189, template: 'herma4333' });
  assert.equal(s.nextAsn(), 190);
  assert.equal(s.listRuns().length, 1);
});

test('Zaehler folgt der hoechsten Nummer, nicht der Reihenfolge', () => {
  const s = createStore(fakeStorage());
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 500, to: 520, count: 21, template: 'herma4333' });
  s.addRun({ ts: 2, prefix: 'AR-', suffix: '', from: 1, to: 10, count: 10, template: 'herma4333' });
  assert.equal(s.nextAsn(), 521);
});

test('Rueckgaengig entfernt den letzten Lauf und setzt den Zaehler zurueck', () => {
  const s = createStore(fakeStorage());
  s.addRun({ ts: 1, prefix: 'AR-', suffix: '', from: 1, to: 189, count: 189, template: 'herma4333' });
  s.addRun({ ts: 2, prefix: 'AR-', suffix: '', from: 190, to: 378, count: 189, template: 'herma4333' });
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
    s.addRun({ ts: i, prefix: 'AR-', suffix: '', from: i * 10 + 1, to: i * 10 + 10, count: 10, template: 'herma4333' });
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test test/store.test.mjs`
Expected: FAIL — `Cannot find module '.../app/js/store.js'`

- [ ] **Step 3: `app/js/store.js` anlegen**

```js
// Einziges Modul, das localStorage kennt. Jeder Zugriff ist abgesichert:
// im privaten Fenster oder bei vollem Kontingent laeuft die App weiter,
// nur ohne Merken.

const K = {
  settings: 'asn.settings',
  templates: 'asn.templates',
  history: 'asn.history',
  ui: 'asn.ui'
};

const MAX_RUNS = 200;

export function createStore(storage = globalThis.localStorage) {
  let ok = true;

  const read = (key, fallback) => {
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const val = JSON.parse(raw);
      return val === null ? fallback : val;
    } catch {
      // Kaputter Speicher oder beschaedigter Inhalt: wie leer behandeln.
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      ok = false;
      return false;
    }
  };

  // Einmal fuehlen, ob der Speicher ueberhaupt funktioniert.
  try {
    storage.getItem(K.settings);
  } catch {
    ok = false;
  }

  const listRuns = () => {
    const runs = read(K.history, []);
    return Array.isArray(runs) ? runs : [];
  };

  return {
    isAvailable: () => ok,

    loadSettings: () => read(K.settings, null),
    saveSettings: (s) => { write(K.settings, s); },

    loadUi: () => read(K.ui, {}),
    saveUi: (u) => { write(K.ui, u); },

    listRuns,

    addRun(run) {
      const runs = listRuns();
      runs.push(run);
      while (runs.length > MAX_RUNS) runs.shift();
      write(K.history, runs);
    },

    undoLastRun() {
      const runs = listRuns();
      if (runs.length === 0) return null;
      const weg = runs.pop();
      write(K.history, runs);
      return weg;
    },

    // Der Zaehler wird abgeleitet, nicht getrennt gespeichert: hoechste
    // vergebene Nummer plus eins. Ein Wert weniger, der auseinanderlaufen kann.
    nextAsn() {
      const runs = listRuns();
      let hoechste = 0;
      for (const r of runs) {
        const to = Number(r && r.to);
        if (Number.isFinite(to) && to > hoechste) hoechste = to;
      }
      return hoechste + 1;
    },

    listUserTemplates() {
      const t = read(K.templates, []);
      return Array.isArray(t) ? t : [];
    },

    saveUserTemplate(t) {
      const all = this.listUserTemplates().filter((x) => x.id !== t.id);
      all.push(t);
      write(K.templates, all);
    },

    deleteUserTemplate(id) {
      write(K.templates, this.listUserTemplates().filter((x) => x.id !== id));
    }
  };
}
```

- [ ] **Step 4: Tests laufen lassen, alle grün**

Run: `node --test test/store.test.mjs`
Expected: PASS — 10 Tests bestanden

- [ ] **Step 5: Beide Test-Dateien zusammen laufen lassen**

Run: `node --test test/*.test.mjs`
Expected: PASS — 20 Tests bestanden

Hinweis: Das Verzeichnis darf nicht ohne Muster übergeben werden — `node --test test/`
scheitert ab Node 24 mit `MODULE_NOT_FOUND`, weil der Pfad als Modul aufgelöst wird.

- [ ] **Step 6: Commit**

```bash
git add app/js/store.js test/store.test.mjs
git commit -m "feat: Datenhaltung mit abgeleitetem ASN-Zaehler und Verlauf"
```

---

### Task 3: Grundgerüst und Gestaltung

Markup und CSS. Am Ende lädt die Seite, die Gruppen klappen auf und zu, Hell
und Dunkel funktionieren — es wird nur noch nichts gezeichnet.

**Files:**
- Create: `app/index.html`
- Create: `app/css/app.css`

**Interfaces:**
- Consumes: nichts
- Produces: die Element-`id`s, die `ui.js` in Task 6 liest. Maßgeblich sind
  genau die Namen der bestehenden Anwendung, damit nichts umbenannt werden
  muss: `pageW pageH secW secH secRows secGapY autoCenter marginLeft marginTop
  safeMargin fitPrintable showGuides labW labH gapX gapY labRadius qrPad
  fontSize prefixFontSize prefix suffix startNum padDigits qrTemplate count
  showText stackPrefix showBorder`. Dazu die Struktur-`id`s `preset`,
  `presetMenu`, `statusCard`, `nextAsn`, `lastRun`, `historyLink`,
  `historyPanel`, `statusLine`, `marginReadout`, `zoom`, `zoomIn`, `zoomOut`,
  `pageCount`, `pagesWrap`, `printBtn`, `printBtnSide`, `fillMaxBtn`,
  `themeBtn`, `warnBox`, `updateBar`, `reloadBtn`, `presetName`,
  `manualMarginRow`, `pageStyle`.

- [ ] **Step 1: `app/index.html` anlegen**

```html
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ASN-Drucker</title>
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#1f2d31">
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="css/app.css">
<style id="pageStyle"></style>
</head>
<body>

<div id="updateBar" class="update-bar" hidden>
  Neue Version verfügbar — <button type="button" id="reloadBtn">neu laden</button>
</div>

<header class="topbar">
  <span class="brand">ASN-Drucker</span>

  <div class="preset-wrap">
    <button type="button" id="preset" class="preset-btn" aria-haspopup="menu" aria-expanded="false">
      <span id="presetName">HERMA 4243/4244/4333</span> <span aria-hidden="true">▾</span>
    </button>
    <div id="presetMenu" class="menu" role="menu" hidden></div>
  </div>

  <span class="spacer"></span>
  <span class="status" id="statusLine"></span>
  <button type="button" id="themeBtn" class="icon-btn" title="Hell / Dunkel">◐</button>
  <button type="button" id="printBtn" class="primary">Drucken</button>
</header>

<main class="layout">
  <aside class="sidebar">

    <section class="status-card" id="statusCard">
      <div class="k">Weiter bei</div>
      <div class="v" id="nextAsn">AR-000001</div>
      <div class="m"><span id="lastRun">noch nichts gedruckt</span>
        · <button type="button" class="linklike" id="historyLink">Verlauf</button></div>
    </section>

    <details class="group" open>
      <summary>Nummernkreis</summary>
      <div class="fields">
        <div class="row">
          <label>Präfix<input type="text" id="prefix"></label>
          <label>Suffix<input type="text" id="suffix"></label>
        </div>
        <div class="row">
          <label>Startnummer<input type="number" id="startNum" step="1"></label>
          <label>Stellen<input type="number" id="padDigits" step="1" min="1"></label>
        </div>
        <div class="row">
          <label>Anzahl<input type="number" id="count" step="1" min="1"></label>
          <button type="button" class="ghost" id="fillMaxBtn">1 Seite füllen</button>
        </div>
        <label class="full">QR-Inhalt <span class="hint">{nr} = Seriennummer</span>
          <input type="text" id="qrTemplate"></label>
      </div>
    </details>

    <details class="group">
      <summary>Bogen</summary>
      <div class="fields">
        <div class="row">
          <label>Seitenbreite (mm)<input type="number" id="pageW" step="0.1"></label>
          <label>Seitenhöhe (mm)<input type="number" id="pageH" step="0.1"></label>
        </div>
        <div class="row">
          <label>Abschnittsbreite (mm)<input type="number" id="secW" step="0.1"></label>
          <label>Abschnittshöhe (mm)<input type="number" id="secH" step="0.1"></label>
        </div>
        <div class="row">
          <label>Abschnitte<input type="number" id="secRows" step="1" min="1"></label>
          <label>Abstand (mm)<input type="number" id="secGapY" step="0.05"></label>
        </div>
        <label class="check"><input type="checkbox" id="autoCenter"> Automatisch zentrieren</label>
        <div class="row" id="manualMarginRow" hidden>
          <label>Rand links (mm)<input type="number" id="marginLeft" step="0.1"></label>
          <label>Rand oben (mm)<input type="number" id="marginTop" step="0.1"></label>
        </div>
        <label class="full">Nicht bedruckbarer Rand (mm)
          <input type="number" id="safeMargin" step="0.1" min="0"></label>
        <label class="check"><input type="checkbox" id="fitPrintable"> In bedruckbaren Bereich einpassen</label>
      </div>
    </details>

    <details class="group">
      <summary>Etikett</summary>
      <div class="fields">
        <div class="row">
          <label>Breite (mm)<input type="number" id="labW" step="0.1"></label>
          <label>Höhe (mm)<input type="number" id="labH" step="0.1"></label>
        </div>
        <div class="row">
          <label>Abstand waagerecht<input type="number" id="gapX" step="0.05"></label>
          <label>Abstand senkrecht<input type="number" id="gapY" step="0.05"></label>
        </div>
        <div class="row">
          <label>Eckenradius (mm)<input type="number" id="labRadius" step="0.1" min="0"></label>
          <label>QR-Rand innen (mm)<input type="number" id="qrPad" step="0.1"></label>
        </div>
        <div class="row">
          <label>Schrift Nummer (mm)<input type="number" id="fontSize" step="0.1"></label>
          <label>Schrift Präfix (mm)<input type="number" id="prefixFontSize" step="0.1"></label>
        </div>
      </div>
    </details>

    <details class="group">
      <summary>Darstellung</summary>
      <div class="fields">
        <label class="check"><input type="checkbox" id="showText"> Seriennummer als Text</label>
        <label class="check"><input type="checkbox" id="stackPrefix"> Präfix in eigener Zeile</label>
        <label class="check"><input type="checkbox" id="showBorder"> Rahmen mitdrucken</label>
        <label class="check"><input type="checkbox" id="showGuides"> Hilfslinien anzeigen</label>
      </div>
    </details>

    <div id="warnBox" class="warn" hidden></div>

    <button type="button" class="primary wide" id="printBtnSide">Drucken / Als PDF</button>
  </aside>

  <section class="preview">
    <div class="tools">
      <button type="button" class="ghost" id="zoomOut">−</button>
      <span id="zoom">100 %</span>
      <button type="button" class="ghost" id="zoomIn">+</button>
      <span id="pageCount"></span>
      <span class="spacer"></span>
      <span id="marginReadout"></span>
    </div>
    <div class="canvas"><div class="pages-wrap" id="pagesWrap"></div></div>
    <div id="historyPanel" class="history" hidden></div>
  </section>
</main>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: `app/css/app.css` anlegen**

```css
/* Design-Tokens. Hell ist die Grundlage, Dunkel ueberschreibt nur Farben. */
:root{
  --bg:#f2f4f6; --surface:#ffffff; --ink:#1b1f23; --muted:#5b6570;
  --line:#e2e6ea; --accent:#2a5d63; --accent-ink:#ffffff;
  --accent-soft:#e7f0ef; --danger:#a4342a; --topbar:#1f2d31; --topbar-ink:#eaf2f2;
  --radius:9px; --gap:10px;
}
:root[data-theme="dark"]{
  --bg:#14181b; --surface:#1c2226; --ink:#e6eaed; --muted:#95a1aa;
  --line:#2b3338; --accent:#4d9aa2; --accent-ink:#0d1214;
  --accent-soft:#1e2c2e; --danger:#e0796d; --topbar:#0f1416; --topbar-ink:#dfe8ea;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#14181b; --surface:#1c2226; --ink:#e6eaed; --muted:#95a1aa;
    --line:#2b3338; --accent:#4d9aa2; --accent-ink:#0d1214;
    --accent-soft:#1e2c2e; --danger:#e0796d; --topbar:#0f1416; --topbar-ink:#dfe8ea;
  }
}

*{box-sizing:border-box;}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:14px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  display:flex; flex-direction:column; min-height:100vh;
}

.update-bar{
  background:var(--accent-soft); border-bottom:1px solid var(--line);
  padding:8px 14px; font-size:13px;
}

.topbar{
  display:flex; align-items:center; gap:10px;
  padding:9px 14px; background:var(--topbar); color:var(--topbar-ink);
}
.brand{font-weight:700; letter-spacing:.2px;}
.spacer{flex:1;}
.status{font-size:12.5px; opacity:.85;}
.preset-wrap{position:relative;}
.preset-btn, .icon-btn{
  background:rgba(255,255,255,.14); color:inherit; border:0;
  border-radius:6px; padding:5px 10px; font:inherit; cursor:pointer;
}
.menu{
  position:absolute; top:calc(100% + 6px); left:0; z-index:20; min-width:280px;
  background:var(--surface); color:var(--ink);
  border:1px solid var(--line); border-radius:var(--radius);
  box-shadow:0 10px 30px rgba(0,0,0,.18); padding:5px;
}
.menu button{
  display:block; width:100%; text-align:left; background:none; border:0;
  padding:8px 10px; border-radius:6px; font:inherit; color:inherit; cursor:pointer;
}
.menu button:hover{background:var(--accent-soft);}
.menu hr{border:0; border-top:1px solid var(--line); margin:5px 0;}

button.primary{
  background:var(--accent); color:var(--accent-ink); border:0;
  border-radius:6px; padding:7px 14px; font:inherit; font-weight:650; cursor:pointer;
}
button.primary[disabled]{opacity:.45; cursor:not-allowed;}
button.ghost{
  background:var(--surface); color:var(--ink); border:1px solid var(--line);
  border-radius:6px; padding:5px 9px; font:inherit; font-size:12px; cursor:pointer;
}
button.wide{width:100%; padding:10px; margin-top:auto;}
.linklike{background:none;border:0;padding:0;color:var(--accent);text-decoration:underline;cursor:pointer;font:inherit;}

.layout{flex:1; display:flex; align-items:stretch; min-height:0;}

.sidebar{
  width:280px; flex:0 0 280px; background:var(--surface);
  border-right:1px solid var(--line); padding:12px;
  display:flex; flex-direction:column; gap:2px; overflow-y:auto;
}

.status-card{
  background:var(--accent-soft); border:1px solid var(--line);
  border-radius:var(--radius); padding:10px 11px; margin-bottom:10px;
}
.status-card .k{font-size:10px; text-transform:uppercase; letter-spacing:.7px;
  color:var(--muted); font-weight:700;}
.status-card .v{font-size:19px; font-weight:700; font-variant-numeric:tabular-nums; margin:1px 0 3px;}
.status-card .m{font-size:11.5px; color:var(--muted);}

.group{border-top:1px solid var(--line);}
.group:first-of-type{border-top:0;}
.group > summary{
  padding:9px 2px; font-weight:650; cursor:pointer; list-style:none;
  display:flex; align-items:center; gap:6px;
}
.group > summary::before{content:"▸"; color:var(--muted); font-size:10px;}
.group[open] > summary::before{content:"▾";}
.group > summary::-webkit-details-marker{display:none;}
.fields{padding:2px 0 10px;}

.row{display:flex; gap:8px; align-items:flex-end;}
.row > label{flex:1;}
label{display:block; font-size:11.5px; color:var(--muted); margin-bottom:7px;}
label.full{display:block;}
label.check{display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--ink);}
label.check input{width:auto; margin:0;}
.hint{color:var(--muted); opacity:.8;}
input[type=text], input[type=number]{
  width:100%; margin-top:3px; padding:6px 8px;
  border:1px solid var(--line); border-radius:6px;
  background:var(--surface); color:var(--ink); font:inherit; font-size:13px;
}
input:focus-visible{outline:2px solid var(--accent); outline-offset:1px;}
input[aria-invalid="true"]{border-color:var(--danger);}
.field-error{color:var(--danger); font-size:11px; margin-top:3px;}

.warn{
  background:color-mix(in srgb, var(--danger) 12%, transparent);
  border:1px solid var(--danger); color:var(--danger);
  border-radius:var(--radius); padding:9px 10px; font-size:12px; margin:10px 0;
}

.preview{flex:1; display:flex; flex-direction:column; min-width:0; position:relative;}
.tools{
  display:flex; align-items:center; gap:8px; padding:7px 12px;
  border-bottom:1px solid var(--line); background:var(--surface);
  font-size:12px; color:var(--muted);
}
.canvas{flex:1; overflow:auto; padding:18px; display:flex; justify-content:center;}
.pages-wrap{display:flex; flex-direction:column; align-items:flex-start; gap:20px;
  transform-origin:top center;}

.page-frame{
  background:#fff; position:relative;
  box-shadow:0 1px 3px rgba(0,0,0,.16), 0 10px 30px rgba(0,0,0,.10);
}
.page-caption{font-size:11px; color:var(--muted); margin-bottom:5px;}
.section-outline{position:absolute; border:1px dashed color-mix(in srgb, var(--muted) 45%, transparent);}
.safe-area{position:absolute; border:1px dashed var(--danger); pointer-events:none;}

/* Etikett: Stanzkontur wie in der HERMA-Vorlage, mittig auf der Schnittkante,
   damit sich beruehrende Zeilen EINE Linie teilen. */
.label{
  position:absolute; background:#fff; color:#000;
  display:flex; align-items:center; overflow:hidden;
  outline:0.3mm solid #6f6e6e; outline-offset:-0.15mm;
}
.label.frame{outline-color:#000;}
.label.qr-failed{outline-color:var(--danger); background:color-mix(in srgb, var(--danger) 10%, #fff);}
.label .qr{flex:0 0 auto; display:flex; align-items:center; justify-content:center;}
.label .txt{
  flex:1; display:flex; align-items:center; justify-content:center;
  font-family:"Consolas","Courier New",monospace; font-weight:600;
  line-height:1; letter-spacing:.2px; white-space:nowrap; overflow:hidden;
}
.label .txt.stacked{flex-direction:column; align-items:center; justify-content:center; gap:0.4mm;}
.label .txt .prefix-line{font-weight:500; letter-spacing:.4px; line-height:1;}
.label .txt .number-line{font-weight:700; line-height:1;}

.history{
  position:absolute; right:14px; top:46px; width:320px; max-height:70%;
  overflow-y:auto; background:var(--surface); border:1px solid var(--line);
  border-radius:var(--radius); box-shadow:0 12px 34px rgba(0,0,0,.2); padding:10px;
}
.history h3{margin:0 0 8px; font-size:13px;}
.history .run{
  display:flex; align-items:baseline; gap:8px; padding:6px 4px;
  border-top:1px solid var(--line); font-size:12px;
}
.history .run:first-of-type{border-top:0;}
.history .run .rng{font-variant-numeric:tabular-nums; font-weight:600;}
.history .run .ts{color:var(--muted); margin-left:auto; font-size:11px;}

@media (max-width: 900px){
  .layout{flex-direction:column;}
  .sidebar{width:auto; flex:none; border-right:0; border-bottom:1px solid var(--line);
    max-height:52vh;}
}

@media print{
  .topbar, .sidebar, .tools, .history, .update-bar, .page-caption{display:none !important;}
  body{display:block; background:#fff; min-height:0;}
  .layout, .preview{display:block;}
  .canvas{padding:0; overflow:visible; display:block;}
  .pages-wrap{display:block; gap:0; transform:none !important;}
  .page-frame{box-shadow:none !important; margin:0;}
  .page-frame ~ .page-frame{break-before:page; page-break-before:always;}
  .section-outline{border:none;}
  .safe-area{display:none;}
  .label{outline:none;}
  .label.frame{outline:0.3mm solid #000; outline-offset:-0.15mm;}
}
```

- [ ] **Step 3: Seite im Browser öffnen und Grundfunktion prüfen**

Run:
```bash
cd app && python3 -m http.server 8099
```
Öffne `http://localhost:8099/`.

Expected: Die Seite lädt, Kopfzeile und Seitenleiste stehen, „Nummernkreis"
ist aufgeklappt, die drei anderen Gruppen sind zu und lassen sich per Klick
öffnen. Der Vorschaubereich ist noch leer. In der Konsole steht ein 404 für
`js/main.js` und `manifest.webmanifest` — beide kommen in späteren Aufgaben.

- [ ] **Step 4: Dunkelmodus prüfen**

Setze in den Entwicklerwerkzeugen `document.documentElement.dataset.theme = 'dark'`.
Expected: Hintergrund, Flächen und Text wechseln; die Bogenvorschau bleibt weiß,
weil `.page-frame` und `.label` bewusst feste Farben haben — Papier ist weiß.

- [ ] **Step 5: Commit**

```bash
git add app/index.html app/css/app.css
git commit -m "feat: Grundgeruest und Gestaltung der Webapp"
```

---

### Task 4: Zeichnen mit QR-Cache, Zeitscheiben und Fehlerabsicherung

**Files:**
- Create: `app/vendor/qrcode.min.js`
- Create: `app/js/render.js`

**Interfaces:**
- Consumes: `computeLayout`, `buildParts` aus `app/js/sheet.js`
- Produces:
  - `qrSVG(data, sizeMM) -> string` (wirft bei Fehler)
  - `clearQrCache() -> void`
  - `renderSheets(container, L, settings) -> RenderHandle`
  - `RenderHandle` ist `{ cancel(): void, done: Promise<RenderResult> }`
  - `RenderResult` ist `{ pages: number, drawn: number, failed: number }`

- [ ] **Step 1: QR-Bibliothek lokal ablegen**

```bash
mkdir -p app/vendor
curl -sL -o app/vendor/qrcode.min.js \
  https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js
test -s app/vendor/qrcode.min.js && head -c 40 app/vendor/qrcode.min.js
```

Expected: Die Datei ist rund 20 KB groß und beginnt mit `var qrcode=function()`.

- [ ] **Step 2: `app/js/render.js` anlegen**

```js
// Zeichnet den Bogen ins DOM. Zweistufig: Rahmen und Positionen sofort,
// QR-Codes in Zeitscheiben nach — sonst blockieren 189 QR-Berechnungen
// die Eingabe.

import { buildParts } from './sheet.js';

const cache = new Map();          // "daten|groesse" -> SVG-Zeichenkette
const CACHE_MAX = 2000;

export function clearQrCache() { cache.clear(); }

export function qrSVG(data, sizeMM) {
  const key = `${data}|${sizeMM}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // qrcode kommt als globales Symbol aus vendor/qrcode.min.js.
  if (typeof qrcode !== 'function') {
    throw new Error('QR-Bibliothek nicht geladen');
  }
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cell = sizeMM / count;
  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        rects += `<rect x="${(c * cell).toFixed(3)}" y="${(r * cell).toFixed(3)}"`
              + ` width="${(cell + 0.01).toFixed(3)}" height="${(cell + 0.01).toFixed(3)}"/>`;
      }
    }
  }
  const svg = `<svg width="${sizeMM}mm" height="${sizeMM}mm" viewBox="0 0 ${sizeMM} ${sizeMM}"`
            + ` xmlns="http://www.w3.org/2000/svg" style="shape-rendering:crispEdges;display:block;">`
            + `${rects}</svg>`;

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, svg);
  return svg;
}

function labelElement(L, s, parts, left, top) {
  const lab = document.createElement('div');
  lab.className = s.showBorder ? 'label frame' : 'label';
  lab.style.borderRadius = `${s.labRadius}mm`;
  lab.style.left = `${left}mm`;
  lab.style.top = `${top}mm`;
  lab.style.width = `${L.labW}mm`;
  lab.style.height = `${L.labH}mm`;

  const qrSize = Math.max(2, L.labH - 2 * Number(s.qrPad));
  const qrCell = document.createElement('div');
  qrCell.className = 'qr';
  qrCell.style.width = `${qrSize}mm`;
  qrCell.style.height = `${qrSize}mm`;
  qrCell.style.marginLeft = `${s.qrPad}mm`;
  lab.appendChild(qrCell);

  if (s.showText) {
    const txt = document.createElement('div');
    txt.className = 'txt';
    txt.style.paddingLeft = '0.8mm';
    txt.style.paddingRight = '0.8mm';

    if (s.stackPrefix && parts.prefix.trim() !== '') {
      txt.classList.add('stacked');
      const p = document.createElement('div');
      p.className = 'prefix-line';
      p.style.fontSize = `${s.prefixFontSize}mm`;
      p.textContent = parts.prefix;
      txt.appendChild(p);

      const n = document.createElement('div');
      n.className = 'number-line';
      n.style.fontSize = `${s.fontSize}mm`;
      n.textContent = parts.numberPart;
      txt.appendChild(n);
    } else {
      txt.style.fontSize = `${s.fontSize}mm`;
      txt.textContent = parts.full;
    }
    lab.appendChild(txt);
  }

  return { lab, qrCell, qrSize };
}

export function renderSheets(container, L, s) {
  let abgebrochen = false;

  const count = Math.max(1, parseInt(s.count, 10) || 1);
  const pages = Math.ceil(count / L.perPage);
  const qrTemplate = s.qrTemplate || '{nr}';
  const auftraege = [];             // {qrCell, lab, daten, groesse}

  container.innerHTML = '';
  let idx = 0;

  for (let p = 0; p < pages; p++) {
    const caption = document.createElement('div');
    caption.className = 'page-caption';
    caption.textContent = `Seite ${p + 1} von ${pages}`;
    container.appendChild(caption);

    const page = document.createElement('div');
    page.className = 'page-frame';
    page.style.width = `${L.pageW}mm`;
    page.style.height = `${L.pageH}mm`;

    if (s.showGuides && L.safeMargin > 0) {
      const safe = document.createElement('div');
      safe.className = 'safe-area';
      safe.style.left = `${L.safeMargin}mm`;
      safe.style.top = `${L.safeMargin}mm`;
      safe.style.width = `${L.pageW - 2 * L.safeMargin}mm`;
      safe.style.height = `${L.pageH - 2 * L.safeMargin}mm`;
      page.appendChild(safe);
    }

    for (let sec = 0; sec < L.secRows; sec++) {
      const secTop = L.marginTop + sec * (L.secH + L.secGapY);

      if (s.showGuides) {
        const o = document.createElement('div');
        o.className = 'section-outline';
        o.style.left = `${L.marginLeft}mm`;
        o.style.top = `${secTop}mm`;
        o.style.width = `${L.secW}mm`;
        o.style.height = `${L.secH}mm`;
        page.appendChild(o);
      }

      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) {
          if (idx >= count) continue;
          const parts = buildParts(s, idx);
          const left = L.marginLeft + L.freeW / 2 + c * (L.labW + L.gapX);
          const top = secTop + L.freeH / 2 + r * (L.labH + L.gapY);
          const { lab, qrCell, qrSize } = labelElement(L, s, parts, left, top);
          page.appendChild(lab);
          auftraege.push({ qrCell, lab, daten: qrTemplate.replace('{nr}', parts.full), groesse: qrSize });
          idx++;
        }
      }
    }
    container.appendChild(page);
  }

  // Zweite Stufe: QR-Codes in Zeitscheiben von je 12 ms nachziehen.
  const done = new Promise((resolve) => {
    let i = 0;
    let failed = 0;

    const scheibe = () => {
      if (abgebrochen) { resolve({ pages, drawn: i, failed }); return; }
      const bis = performance.now() + 12;
      while (i < auftraege.length && performance.now() < bis) {
        const a = auftraege[i];
        try {
          a.qrCell.innerHTML = qrSVG(a.daten, a.groesse);
        } catch {
          // Nie stillschweigend weitermachen: das Etikett wird sichtbar
          // markiert, und main.js sperrt daraufhin den Druck.
          a.lab.classList.add('qr-failed');
          a.qrCell.textContent = '!';
          failed++;
        }
        i++;
      }
      if (i < auftraege.length) {
        requestAnimationFrame(scheibe);
      } else {
        resolve({ pages, drawn: i, failed });
      }
    };
    requestAnimationFrame(scheibe);
  });

  return { cancel() { abgebrochen = true; }, done };
}
```

- [ ] **Step 3: Einbindung der Bibliothek in `index.html` ergänzen**

Füge vor dem Modul-Script ein:

```html
<script src="vendor/qrcode.min.js"></script>
<script type="module" src="js/main.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add app/vendor/qrcode.min.js app/js/render.js app/index.html
git commit -m "feat: Zeichnen mit QR-Cache, Zeitscheiben und Fehlermarkierung"
```

---

### Task 5: Druckdokument

**Files:**
- Create: `app/js/print.js`

**Interfaces:**
- Consumes: `sheetCSS` aus `app/js/sheet.js`
- Produces: `openPrintTab(L, pagesHTML) -> boolean` — `false`, wenn der Tab
  blockiert wurde

- [ ] **Step 1: `app/js/print.js` anlegen**

```js
// Baut das Druckdokument und schreibt es direkt in einen neuen Tab.
// Bewusst kein blob:-Umweg — Safari behandelt blob:-Dokumente in neuen Tabs
// unzuverlaessig, und die URL wurde nach 30 s ungueltig.

import { sheetCSS } from './sheet.js';

export function openPrintTab(L, pagesHTML) {
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Etiketten – Druckvorschau</title>
<style>
${sheetCSS(L)}
.hinweis{
  background:#fff3cd; border-bottom:2px solid #e0a800; padding:14px 18px;
  font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#3a2e00;
}
.hinweis h2{margin:0 0 8px; font-size:15px;}
.hinweis ol{margin:0 0 10px; padding-left:20px; line-height:1.6;}
.hinweis b{color:#8a6300;}
.hinweis p{margin:0 0 10px; line-height:1.6;}
.hinweis button{
  background:#2a5d63; color:#fff; border:none; border-radius:5px;
  padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer;
}
@media print{ .hinweis{display:none !important;} }
</style></head>
<body>
<div class="hinweis">
  <h2>Vor dem Drucken im Dialog bitte prüfen:</h2>
  <ol>
    <li>Papierformat: <b>${L.pageW} &times; ${L.pageH} mm</b></li>
    <li>Ränder: <b>Keine / 0</b> (nicht „Standard“)</li>
    <li>Skalierung: <b>100&nbsp;%</b> — „An Papierformat anpassen“ <b>deaktivieren</b></li>
    <li>Kopf- und Fußzeilen: <b>Aus</b></li>
  </ol>
  <p><b>Safari</b> ignoriert die Seitengröße aus dem Dokument und verkleinert
  automatisch — die Etiketten sitzen dann zu hoch und die Maße stimmen nicht.
  Für maßhaltigen Druck ist <b>Chrome</b> zuverlässiger.</p>
  <button onclick="window.print()">Jetzt drucken</button>
</div>
${pagesHTML}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/js/print.js
git commit -m "feat: Druckdokument ohne blob-Umweg"
```

---

### Task 6: Verdrahtung, Validierung und Fehlerbehandlung

Hier wird die App zum ersten Mal lauffähig.

**Files:**
- Create: `app/js/ui.js`
- Create: `app/js/main.js`
- Modify: `app/index.html` (nur falls fehlende `id`s auffallen)

**Interfaces:**
- Consumes: alles aus `sheet.js`, `presets.js`, `store.js`, `render.js`,
  `print.js`
- Produces:
  - aus `ui.js`: `FIELDS -> string[]`, `readForm() -> Settings`,
    `writeForm(settings) -> void`, `validate(settings) -> Problem[]`,
    `showProblems(problems) -> void`, `setTheme(mode) -> void`
  - `Problem` ist `{ id, text }`

- [ ] **Step 1: `app/js/ui.js` anlegen**

```js
// Verbindet Formular und Einstellungsobjekt. Kein Zustands-Container:
// alle Felder fuettern dasselbe eine Objekt.

import { DEFAULTS } from './presets.js';

const $ = (id) => document.getElementById(id);

export const FIELDS = Object.keys(DEFAULTS);

const CHECKBOXES = new Set([
  'autoCenter', 'fitPrintable', 'showGuides', 'showText', 'stackPrefix', 'showBorder'
]);
const TEXTS = new Set(['prefix', 'suffix', 'qrTemplate']);

export function readForm() {
  const s = { ...DEFAULTS };
  for (const id of FIELDS) {
    const el = $(id);
    if (!el) continue;
    if (CHECKBOXES.has(id)) s[id] = el.checked;
    else if (TEXTS.has(id)) s[id] = el.value;
    else {
      const v = parseFloat(el.value);
      s[id] = Number.isFinite(v) ? v : NaN;   // NaN faengt validate() ab
    }
  }
  return s;
}

export function writeForm(s) {
  for (const id of FIELDS) {
    const el = $(id);
    if (!el) continue;
    if (CHECKBOXES.has(id)) el.checked = !!s[id];
    else el.value = s[id];
  }
  $('manualMarginRow').hidden = !!s.autoCenter;
}

// Ungueltige Zahlen werden nicht stillschweigend zu 0 gemacht, sondern gemeldet.
export function validate(s) {
  const p = [];
  const zahl = (id, name, min = 0) => {
    if (!Number.isFinite(s[id])) p.push({ id, text: `${name}: keine gültige Zahl` });
    else if (s[id] < min) p.push({ id, text: `${name}: muss mindestens ${min} sein` });
  };
  zahl('pageW', 'Seitenbreite', 1);
  zahl('pageH', 'Seitenhöhe', 1);
  zahl('secW', 'Abschnittsbreite', 1);
  zahl('secH', 'Abschnittshöhe', 1);
  zahl('secRows', 'Abschnitte', 1);
  zahl('secGapY', 'Abstand zwischen Abschnitten');
  zahl('labW', 'Etikettenbreite', 1);
  zahl('labH', 'Etikettenhöhe', 1);
  zahl('gapX', 'Abstand waagerecht');
  zahl('gapY', 'Abstand senkrecht');
  zahl('labRadius', 'Eckenradius');
  zahl('qrPad', 'QR-Rand innen');
  zahl('fontSize', 'Schriftgröße Nummer', 0.1);
  zahl('prefixFontSize', 'Schriftgröße Präfix', 0.1);
  zahl('safeMargin', 'Nicht bedruckbarer Rand');
  zahl('count', 'Anzahl', 1);
  zahl('startNum', 'Startnummer');
  zahl('padDigits', 'Stellen', 1);
  if (!s.autoCenter) {
    zahl('marginLeft', 'Rand links');
    zahl('marginTop', 'Rand oben');
  }
  if (s.labW > s.secW) p.push({ id: 'labW', text: 'Etikett ist breiter als der Abschnitt' });
  if (s.labH > s.secH) p.push({ id: 'labH', text: 'Etikett ist höher als der Abschnitt' });
  return p;
}

export function showProblems(problems) {
  for (const id of FIELDS) {
    const el = $(id);
    if (el) el.removeAttribute('aria-invalid');
  }
  document.querySelectorAll('.field-error').forEach((e) => e.remove());

  for (const { id, text } of problems) {
    const el = $(id);
    if (!el) continue;
    el.setAttribute('aria-invalid', 'true');
    const d = document.createElement('div');
    d.className = 'field-error';
    d.textContent = text;
    el.insertAdjacentElement('afterend', d);
  }
}

export function setTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
}
```

- [ ] **Step 2: `app/js/main.js` anlegen**

```js
import { computeLayout, pageRule } from './sheet.js';
import { DEFAULTS, BUILTIN, applyTemplate } from './presets.js';
import { createStore } from './store.js';
import { renderSheets } from './render.js';
import { openPrintTab } from './print.js';
import { FIELDS, readForm, writeForm, validate, showProblems, setTheme } from './ui.js';

const $ = (id) => document.getElementById(id);
const store = createStore();

let laufendesZeichnen = null;
let letzteGueltige = null;
let druckGesperrt = false;
let aktiveVorlage = 'herma4333';

const asnText = (s, nr) =>
  `${s.prefix}${String(nr).padStart(Math.max(1, parseInt(s.padDigits, 10) || 1), '0')}${s.suffix}`;

function alleVorlagen() {
  return [...Object.values(BUILTIN), ...store.listUserTemplates()];
}

function setzeDruckSperre(gesperrt, grund) {
  druckGesperrt = gesperrt;
  $('printBtn').disabled = gesperrt;
  $('printBtnSide').disabled = gesperrt;
  const box = $('warnBox');
  if (grund) { box.textContent = grund; box.hidden = false; }
  else box.hidden = true;
}

function aktualisiereStatuskarte() {
  const s = readForm();
  const naechste = store.nextAsn();
  $('nextAsn').textContent = asnText(s, naechste);
  const runs = store.listRuns();
  if (runs.length === 0) {
    $('lastRun').textContent = 'noch nichts gedruckt';
  } else {
    const r = runs[runs.length - 1];
    const d = new Date(r.ts);
    const pad = (x) => String(x).padStart(2, '0');
    $('lastRun').textContent =
      `zuletzt ${String(r.from).padStart(6, '0')}–${String(r.to).padStart(6, '0')}`
      + ` · ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  }
}

function zeichne() {
  const s = readForm();
  const probleme = validate(s);
  showProblems(probleme);

  if (probleme.length > 0) {
    setzeDruckSperre(true, 'Bitte die markierten Felder korrigieren.');
    return;                              // Vorschau behaelt den letzten Stand
  }

  letzteGueltige = s;
  store.saveSettings(s);

  const L = computeLayout(s);
  $('pageStyle').textContent = pageRule(L);

  const count = Math.max(1, parseInt(s.count, 10) || 1);
  const seiten = Math.ceil(count / L.perPage);
  $('statusLine').textContent =
    `${count} Etiketten · ${seiten} Seite${seiten === 1 ? '' : 'n'} · ${L.perPage} pro Seite`;

  $('pageCount').textContent = `Seite 1 / ${seiten}`;

  const minRand = Math.min(L.inkLeft, L.inkRight, L.inkTop, L.inkBottom);
  $('marginReadout').textContent =
    `Rand außen ${L.inkLeft.toFixed(2)} / ${L.inkTop.toFixed(2)} mm`;

  const warnungen = [];
  if (L.safeMargin > 0 && minRand < L.safeMargin) {
    warnungen.push(`Äußere Etiketten liegen nur ${minRand.toFixed(2)} mm vom Blattrand`
      + ` entfernt — der Drucker schneidet dort ab.`);
  }
  const gesamtHoehe = L.secRows * L.secH + (L.secRows - 1) * L.secGapY;
  const passtNicht = L.marginTop < 0 || L.marginLeft < 0 || gesamtHoehe > L.pageH + 0.5;
  if (passtNicht) warnungen.push('Die Abschnitte passen nicht auf die Seitengröße.');

  if (laufendesZeichnen) laufendesZeichnen.cancel();
  laufendesZeichnen = renderSheets($('pagesWrap'), L, s);

  laufendesZeichnen.done.then(({ failed }) => {
    if (failed > 0) {
      setzeDruckSperre(true,
        `${failed} QR-Code${failed === 1 ? '' : 's'} konnte${failed === 1 ? '' : 'n'} nicht erzeugt werden.`
        + ' Drucken ist gesperrt, damit keine leeren Etiketten auf Papier landen.');
    } else {
      setzeDruckSperre(false, warnungen.join(' '));
      if (warnungen.length > 0) { $('warnBox').textContent = warnungen.join(' '); $('warnBox').hidden = false; }
    }
    aktualisiereStatuskarte();
  });
}

// Eingaben entprellen, damit das Tippen fluessig bleibt.
let timer = null;
const zeichneVerzoegert = () => {
  clearTimeout(timer);
  timer = setTimeout(zeichne, 150);
};

function drucke() {
  if (druckGesperrt) return;
  const s = letzteGueltige || readForm();
  const L = computeLayout(s);

  const geoeffnet = openPrintTab(L, $('pagesWrap').innerHTML);
  if (!geoeffnet) {
    setzeDruckSperre(false,
      'Das Öffnen des Druck-Tabs wurde blockiert. Bitte Pop-ups für diese Seite erlauben.');
    return;
  }

  const von = parseInt(s.startNum, 10) || 0;
  const anzahl = Math.max(1, parseInt(s.count, 10) || 1);
  store.addRun({
    ts: Date.now(), prefix: s.prefix, suffix: s.suffix,
    from: von, to: von + anzahl - 1, count: anzahl, template: aktiveVorlage
  });
  aktualisiereStatuskarte();
}

function zeigeVerlauf() {
  const p = $('historyPanel');
  if (!p.hidden) { p.hidden = true; return; }
  const runs = [...store.listRuns()].reverse();
  p.innerHTML = '<h3>Druckverlauf</h3>';
  if (runs.length === 0) {
    p.insertAdjacentHTML('beforeend', '<p class="hint">Noch keine Läufe.</p>');
  }
  runs.forEach((r, i) => {
    const d = new Date(r.ts);
    const pad = (x) => String(x).padStart(2, '0');
    const row = document.createElement('div');
    row.className = 'run';
    row.innerHTML = `<span class="rng">${r.prefix}${String(r.from).padStart(6, '0')}`
      + `–${String(r.to).padStart(6, '0')}</span>`
      + `<span class="ts">${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}</span>`;
    if (i === 0) {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = 'Rückgängig';
      b.addEventListener('click', () => { store.undoLastRun(); aktualisiereStatuskarte(); zeigeVerlauf(); zeigeVerlauf(); });
      row.appendChild(b);
    }
    p.appendChild(row);
  });
  p.hidden = false;
}

function baueVorlagenMenue() {
  const m = $('presetMenu');
  m.innerHTML = '';
  for (const t of alleVorlagen()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.name;
    b.addEventListener('click', () => {
      aktiveVorlage = t.id;
      $('presetName').textContent = t.name.split(' — ')[0];
      writeForm(applyTemplate(readForm(), t));
      m.hidden = true;
      $('preset').setAttribute('aria-expanded', 'false');
      zeichne();
    });
    m.appendChild(b);
  }
  m.insertAdjacentHTML('beforeend', '<hr>');
  const neu = document.createElement('button');
  neu.type = 'button';
  neu.textContent = 'Aktuelle Maße als eigene Vorlage sichern …';
  neu.addEventListener('click', () => {
    const name = prompt('Name der Vorlage:');
    if (!name) return;
    const s = readForm();
    const t = { id: `u${Date.now()}`, name };
    for (const k of ['pageW','pageH','secW','secH','secRows','secGapY',
                     'labW','labH','gapX','gapY','labRadius','autoCenter','count']) t[k] = s[k];
    store.saveUserTemplate(t);
    aktiveVorlage = t.id;
    $('presetName').textContent = name;
    baueVorlagenMenue();
    $('presetMenu').hidden = true;
  });
  m.appendChild(neu);
}

function start() {
  const gespeichert = store.loadSettings();
  writeForm({ ...DEFAULTS, ...(gespeichert || {}) });

  const ui = store.loadUi();
  setTheme(ui.theme);

  // Offene Gruppen wiederherstellen und Aenderungen merken (Spec 6: asn.ui).
  const gruppen = [...document.querySelectorAll('.group')];
  gruppen.forEach((g, i) => {
    if (Array.isArray(ui.groups)) g.open = !!ui.groups[i];
    g.addEventListener('toggle', () => {
      store.saveUi({ ...store.loadUi(), groups: gruppen.map((x) => x.open) });
    });
  });
  if (!store.isAvailable()) {
    $('warnBox').textContent =
      'Einstellungen können in diesem Browser nicht gespeichert werden — die App funktioniert, merkt sich aber nichts.';
    $('warnBox').hidden = false;
  }

  baueVorlagenMenue();
  aktualisiereStatuskarte();

  for (const id of FIELDS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      if (id === 'autoCenter') $('manualMarginRow').hidden = el.checked;
      zeichneVerzoegert();
    });
  }

  $('preset').addEventListener('click', () => {
    const m = $('presetMenu');
    m.hidden = !m.hidden;
    $('preset').setAttribute('aria-expanded', String(!m.hidden));
  });

  $('fillMaxBtn').addEventListener('click', () => {
    const L = computeLayout(readForm());
    document.getElementById('count').value = L.perPage;
    zeichne();
  });

  $('nextAsn').addEventListener('click', () => {
    document.getElementById('startNum').value = store.nextAsn();
    zeichne();
  });

  $('historyLink').addEventListener('click', zeigeVerlauf);
  $('printBtn').addEventListener('click', drucke);
  $('printBtnSide').addEventListener('click', drucke);

  $('themeBtn').addEventListener('click', () => {
    const jetzt = document.documentElement.dataset.theme;
    const neu = jetzt === 'dark' ? 'light' : 'dark';
    setTheme(neu);
    store.saveUi({ ...store.loadUi(), theme: neu });
  });

  let zoom = Number(ui.zoom) || 100;
  const setzeZoom = (z, merken = true) => {
    zoom = Math.max(25, Math.min(200, z));
    document.getElementById('zoom').textContent = `${zoom} %`;
    document.getElementById('pagesWrap').style.transform = `scale(${zoom / 100})`;
    if (merken) store.saveUi({ ...store.loadUi(), zoom });
  };
  setzeZoom(zoom, false);
  $('zoomIn').addEventListener('click', () => setzeZoom(zoom + 25));
  $('zoomOut').addEventListener('click', () => setzeZoom(zoom - 25));

  zeichne();
}

start();
```

- [ ] **Step 3: App im Browser prüfen**

Run: `cd app && python3 -m http.server 8099`, dann `http://localhost:8099/`.

Expected:
- Der HERMA-Bogen erscheint mit 189 Etiketten auf einer Seite.
- Über der Vorschau steht „Rand außen 8,60 / 13,50 mm".
- Die Kopfzeile meldet „189 Etiketten · 1 Seite · 189 pro Seite".
- Anzahl auf 500 ändern: nach kurzer Verzögerung erscheinen drei Seiten.
- Ein Feld leeren: das Feld wird rot markiert, darunter steht der Grund, der
  Druckknopf ist gesperrt, die Vorschau bleibt stehen.
- Seite neu laden: die geänderten Werte sind noch da.

- [ ] **Step 4: Fehlerfall QR-Bibliothek prüfen**

Benenne `app/vendor/qrcode.min.js` kurzzeitig um und lade neu:

```bash
mv app/vendor/qrcode.min.js app/vendor/qrcode.min.js.aus
```

Expected: Die Etiketten erscheinen mit rotem Rahmen und „!", im Warnkasten
steht die Meldung, und **der Druckknopf ist gesperrt**. Das ist der Fehler,
der früher stillschweigend eine leere Seite gedruckt hat.

Danach zurückbenennen:

```bash
mv app/vendor/qrcode.min.js.aus app/vendor/qrcode.min.js
```

- [ ] **Step 5: Commit**

```bash
git add app/js/ui.js app/js/main.js
git commit -m "feat: Verdrahtung, Feldvalidierung und Drucksperre bei QR-Fehlern"
```

---

### Task 7: Installierbarkeit und Offline-Betrieb

**Files:**
- Create: `app/manifest.webmanifest`
- Create: `app/sw.js`
- Create: `app/icons/icon-192.png`, `app/icons/icon-512.png`, `app/icons/icon-maskable-512.png`
- Modify: `app/js/main.js` (Registrierung und Aktualisierungsleiste)

**Interfaces:**
- Consumes: nichts
- Produces: registrierter Service Worker; die Aktualisierungsleiste `#updateBar`
  wird sichtbar, sobald eine neue Fassung wartet

- [ ] **Step 1: Icons erzeugen**

Ein schlichtes Zeichen genügt: dunkles Quadrat, weißes QR-Motiv. Erzeuge es
ohne zusätzliche Werkzeuge über den Browser oder lege eigene PNGs ab. Mit
Python und der bereits vorhandenen Bordausstattung:

```bash
mkdir -p app/icons
python3 - <<'PY'
import zlib, struct
def png(path, size, muster):
    px = bytearray()
    for y in range(size):
        px.append(0)
        for x in range(size):
            r = int(x / size * 8); c = int(y / size * 8)
            hell = muster[c][r] == '1'
            px += bytes((255,255,255) if hell else (31,45,49))
    def chunk(t, d):
        cc = t + d
        return struct.pack('>I', len(d)) + cc + struct.pack('>I', zlib.crc32(cc) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(px), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)

m = ['11101110','10001010','10101110','00000000',
     '11100010','10100111','10101010','00101110']
png('app/icons/icon-192.png', 192, m)
png('app/icons/icon-512.png', 512, m)
png('app/icons/icon-maskable-512.png', 512, m)
print('Icons erzeugt')
PY
ls -la app/icons/
```

Expected: Drei PNG-Dateien.

- [ ] **Step 2: `app/manifest.webmanifest` anlegen**

```json
{
  "name": "ASN-Drucker",
  "short_name": "ASN",
  "description": "QR-Etiketten für paperless-ngx-Archivnummern",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "background_color": "#f2f4f6",
  "theme_color": "#1f2d31",
  "lang": "de",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 3: `app/sw.js` anlegen**

```js
// Cache-first fuer die App-Schale. Zur Laufzeit ist kein Netz noetig,
// weil auch die QR-Bibliothek lokal liegt.
// Bei jeder Aenderung an den Dateien die Versionsnummer erhoehen.

const CACHE = 'asn-v1';

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
  './js/print.js',
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
```

- [ ] **Step 4: Registrierung in `app/js/main.js` ergänzen**

Füge ans Ende der Datei, hinter `start();`, ein:

```js
// Service Worker registrieren und auf eine wartende Fassung achten.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const zeigeLeiste = (worker) => {
      const bar = document.getElementById('updateBar');
      bar.hidden = false;
      document.getElementById('reloadBtn').addEventListener('click', () => {
        worker.postMessage('skipWaiting');
        location.reload();
      }, { once: true });
    };
    if (reg.waiting) zeigeLeiste(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      if (!neu) return;
      neu.addEventListener('statechange', () => {
        if (neu.state === 'installed' && navigator.serviceWorker.controller) zeigeLeiste(neu);
      });
    });
  }).catch(() => { /* ohne Service Worker laeuft die App trotzdem */ });
}
```

- [ ] **Step 5: Offline-Betrieb prüfen**

Run: `cd app && python3 -m http.server 8099`, Seite laden, dann in den
Entwicklerwerkzeugen unter „Application → Service Workers" prüfen, dass er
aktiv ist. Danach:

```bash
# Server stoppen (Strg+C) und Seite neu laden
```

Expected: Die App lädt weiterhin vollständig, Etiketten werden gezeichnet,
QR-Codes erscheinen. In der Adressleiste bietet Chrome die Installation an.

- [ ] **Step 6: Commit**

```bash
git add app/manifest.webmanifest app/sw.js app/icons app/js/main.js
git commit -m "feat: installierbar und offline lauffaehig"
```

---

### Task 8: Druckabnahme gegen die HERMA-Vorlage

Die Unit-Tests sichern die Rechnung. Diese Aufgabe sichert, was tatsächlich auf
Papier landet.

**Files:**
- Create: `test/print-check.mjs`
- Modify: `README.md` (anlegen)
- Modify: `etiketten-generator.html` → verschieben nach `legacy/`

**Interfaces:**
- Consumes: die fertige App aus Task 1–7
- Produces: `node test/print-check.mjs` meldet bestanden oder listet
  Abweichungen

- [ ] **Step 1: `test/print-check.mjs` anlegen**

```js
// Druckabnahme: startet Headless Chrome, laesst die App zeichnen, misst die
// Etikettenpositionen im DOM und prueft die erzeugten PDF-Seiten.
// Voraussetzung: Google Chrome ist installiert.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = new URL('../app/index.html', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'asn-'));

function dumpDom(html) {
  const f = join(tmp, `probe-${Date.now()}.html`);
  writeFileSync(f, html);
  return execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--virtual-time-budget=15000',
    '--allow-file-access-from-files', '--dump-dom', `file://${f}`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Die App in einem Rahmen laden und nach dem Zeichnen messen.
const messHtml = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="out">…</pre>
<script type="module">
  const f = document.createElement('iframe');
  f.style.cssText = 'width:1400px;height:1200px;border:0;position:absolute;left:-99999px';
  document.body.appendChild(f);
  f.src = 'file://${APP}';
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument, MM = 96/25.4;
    const labs = [...d.querySelectorAll('.label')];
    const fr = d.querySelector('.page-frame').getBoundingClientRect();
    const first = labs[0].getBoundingClientRect();
    const last = labs[labs.length-1].getBoundingClientRect();
    const cs = getComputedStyle(labs[0]);
    document.getElementById('out').textContent = JSON.stringify({
      anzahl: labs.length,
      seiten: d.querySelectorAll('.page-frame').length,
      ersteLinks: +((first.left-fr.left)/MM).toFixed(2),
      ersteOben:  +((first.top-fr.top)/MM).toFixed(2),
      letzteRechts: +((last.right-fr.left)/MM).toFixed(2),
      letzteUnten:  +((last.bottom-fr.top)/MM).toFixed(2),
      radiusPx: cs.borderTopLeftRadius,
      kontur: cs.outlineColor,
      seitenBox: d.getElementById('pageStyle').textContent.trim()
    });
  }, 4000);
</script>`;

const dom = dumpDom(messHtml);
const roh = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)[1]
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const m = JSON.parse(roh);
console.log('Gemessen:', m);

const nah = (ist, soll, tol, name) =>
  assert.ok(Math.abs(ist - soll) <= tol, `${name}: ${ist} statt ${soll}`);

assert.equal(m.anzahl, 189, 'Etikettenzahl');
assert.equal(m.seiten, 1, 'Seitenzahl');
nah(m.ersteLinks, 8.6, 0.02, 'erste Ecke links');
nah(m.ersteOben, 13.5, 0.02, 'erste Ecke oben');
nah(m.letzteRechts, 201.4, 0.02, 'letzte Ecke rechts');
nah(m.letzteUnten, 283.5, 0.05, 'letzte Ecke unten');
nah(parseFloat(m.radiusPx), 1.1 * 96 / 25.4, 0.1, 'Eckenradius');
assert.equal(m.kontur, 'rgb(111, 110, 110)', 'Konturfarbe #6F6E6E');
assert.equal(m.seitenBox, '@page{size:210mm 297mm; margin:0;}', 'Seitenbox');

rmSync(tmp, { recursive: true, force: true });
console.log('Druckabnahme bestanden.');
```

- [ ] **Step 2: Abnahme laufen lassen**

Run: `node test/print-check.mjs`
Expected: `Druckabnahme bestanden.`

- [ ] **Step 3: Optische Deckungsprobe gegen das PDF**

Diese Prüfung bleibt von Hand, weil sie ein Auge braucht:

1. In der App „Rahmen mitdrucken" einschalten und drucken, Ausgabe als PDF
   sichern.
2. Das erzeugte PDF und `Etiketten-Vorlage-HERMA-25-4x10-blanko.pdf` bei
   gleicher Auflösung als Bild rendern.
3. Übereinanderlegen und prüfen: Die Rahmen müssen auf der Stanzkontur liegen;
   die Vorlage darf nur an den abgerundeten Ecken als Haarlinie durchscheinen.

Expected: Abweichung höchstens 0,05 mm.

- [ ] **Step 4: Altdatei beiseitelegen**

```bash
mkdir -p legacy
git mv etiketten-generator.html legacy/etiketten-generator.html
git mv etiketten-generator.html.bak legacy/etiketten-generator-original.html
```

- [ ] **Step 5: `README.md` anlegen**

```markdown
# ASN-Drucker

Erzeugt maßhaltige QR-Etiketten für paperless-ngx-Archivnummern.

## Betrieb

`app/` ist die auslieferbare Wurzel. Ordner in ein statisches Verzeichnis
neben paperless-ngx legen, zum Beispiel als nginx-Volume. Kein Build-Schritt.

Lokal ausprobieren:

    cd app && python3 -m http.server 8099

## Tests

    node --test test/*.test.mjs   # Geometrie und Datenhaltung
    node test/print-check.mjs  # Druckabnahme, braucht Google Chrome

## Wichtig

Die Maße in `app/js/sheet.js` und `app/js/presets.js` sind gegen die
HERMA-Stanzvorlage vermessen. Änderungen dort müssen `test/geometry.test.mjs`
bestehen.

Für maßhaltigen Druck **Chrome** verwenden, Ränder auf „Keine", Skalierung
100 %. Safari ignoriert die Seitengröße aus dem Dokument und verkleinert
automatisch.

`legacy/` enthält die frühere einteilige Fassung als Referenz.
```

- [ ] **Step 6: Alles zusammen laufen lassen**

Run:
```bash
node --test test/*.test.mjs
node test/print-check.mjs
```
Expected: 20 Unit-Tests bestanden, Druckabnahme bestanden.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Druckabnahme, README und Ablage der Altfassung"
```

---

## Selbstdurchsicht

**Abdeckung der Spec:**

| Spec-Abschnitt | Aufgabe |
|---|---|
| 3 Dateistruktur | 1–7 |
| 4 sheet.js | 1 |
| 4 presets.js | 1, 6 |
| 4 render.js | 4 |
| 4 print.js | 5 |
| 4 store.js | 2 |
| 4 ui.js / main.js | 6 |
| 5 Oberfläche | 3, 6 |
| 6 Datenhaltung | 2, 6 |
| 7 Offline und Installation | 7 |
| 8 Fehlerfälle | 2 (Speicher), 4 (QR), 6 (Validierung, Warnungen, Pop-up) |
| 9 Leistung | 4 (Cache, Zeitscheiben, Abbruch), 6 (Entprellen) |
| 10 Tests und Abnahme | 1, 2, 8 |

**Offene Punkte, die bewusst so stehen:**

- Für `render.js`, `ui.js` und `main.js` gibt es keine Unit-Tests. Sie hängen
  am DOM; sie werden über die Prüfschritte in Task 6 und die Druckabnahme in
  Task 8 abgesichert. Das ist eine Entscheidung, keine Lücke.
- Der Verlaufs-Umschalter in `zeigeVerlauf()` ruft sich nach dem Rückgängig
  zweimal auf, um die Liste neu aufzubauen. Das ist absichtlich simpel
  gehalten; wer es eleganter mag, trennt Aufbau und Umschalten.
