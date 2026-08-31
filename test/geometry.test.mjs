import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout, pageRule } from '../app/js/sheet.js';
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

test('Druckregeln in app.css: das Blatt allein, ohne Bedienelemente', () => {
  const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('@media print'));
  assert.ok(block.length > 0, '@media print fehlt');
  // Seit der Druck direkt aus der Seite laeuft, sind diese Regeln die einzige
  // Quelle fuer das Druckbild — vorher standen sie doppelt in sheetCSS.
  assert.match(block, /\.topbar, \.sidebar, \.tools, \.history, \.update-bar, \.page-caption\{display:none !important;\}/);
  assert.match(block, /\.page-frame ~ \.page-frame\{break-before:page; page-break-before:always;\}/);
  assert.match(block, /\.section-outline\{border:none;\}/);
  assert.match(block, /\.safe-area\{display:none;\}/);
  assert.match(block, /\.label\{outline:none;\}/);
  assert.match(block, /\.label\.frame\{outline:0\.3mm solid #000; outline-offset:-0\.15mm;\}/);
  assert.match(block, /\.pages-wrap\{display:block; gap:0; transform:none !important;\}/,
    'Der Zoom der Vorschau darf nicht mitgedruckt werden');
});
