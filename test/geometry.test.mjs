import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout, pageRule, headingFits, labelTop, labelLeft, fitZoom,
         kontrastZuWeiss, qrLesbar } from '../app/js/sheet.js';
import { DEFAULTS, BUILTIN } from '../app/js/presets.js';

const nah = (ist, soll, tol = 0.01) =>
  assert.ok(Math.abs(ist - soll) <= tol, `${ist} weicht von ${soll} um mehr als ${tol} ab`);

const mit = (id) => ({ ...DEFAULTS, ...BUILTIN[id] });

test('Vorlage 189 ergibt 7 x 27 = 189 Etiketten', () => {
  const L = computeLayout(mit('bogen189'));
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 27);
  assert.equal(L.perSection, 189);
  assert.equal(L.perPage, 189);
});

test('Vorlage 189: Aussenraender 8,60 und 13,50 mm', () => {
  const L = computeLayout(mit('bogen189'));
  nah(L.inkLeft, 8.6);
  nah(L.inkRight, 8.6);
  nah(L.inkTop, 13.5);
  nah(L.inkBottom, 13.5);
});

test('Vorlage 189: erste und letzte Etikettenecke', () => {
  const s = mit('bogen189');
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

test('Vorlage 189: Teilung 27,9 und 10,0 mm', () => {
  const s = mit('bogen189');
  nah(s.labW + s.gapX, 27.9);
  nah(s.labH + s.gapY, 10.0);
});

test('Seitenbox folgt den Seitenmassen, nicht fest A4', () => {
  const L1 = computeLayout(mit('bogen189'));
  assert.equal(pageRule(L1), '@page{size:210mm 297mm; margin:0;}');

  const L2 = computeLayout({ ...mit('bogen189'), pageH: 148, secH: 140, secRows: 1 });
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
  const L = computeLayout({ ...mit('bogen189'), fitPrintable: true, safeMargin: 4.2 });
  assert.equal(L.cols, 7);
  assert.equal(L.rows, 27);
});

test('Manuelle Raender ueberschreiben das Zentrieren', () => {
  const L = computeLayout({ ...mit('bogen189'), autoCenter: false, marginLeft: 5, marginTop: 20 });
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
  assert.match(block, /\.pages-wrap\{display:block; gap:0; transform:none !important; zoom:1 !important;\}/,
    'Der Zoom der Vorschau darf nicht mitgedruckt werden — weder transform noch zoom');
});

test('Ueberschrift passt in den freien Streifen der Vorlage 189', () => {
  const s = mit('bogen189');
  const L = computeLayout(s);
  nah(L.inkTop, 13.5);                       // 13,5 mm frei ueber der ersten Reihe
  assert.equal(headingFits(L, { ...s, heading: 'Ordner 3', headingSize: 4 }), true);
  assert.equal(headingFits(L, { ...s, heading: 'Ordner 3', headingSize: 13.5 }), true);
  assert.equal(headingFits(L, { ...s, heading: 'Ordner 3', headingSize: 14 }), false);
});

test('Beim alten Bogen ist oben zu wenig Platz fuer 4 mm', () => {
  const s = mit('bogen4');
  const L = computeLayout(s);
  nah(L.inkTop, 2.35);
  assert.equal(headingFits(L, { ...s, heading: 'Ordner 3', headingSize: 4 }), false);
  assert.equal(headingFits(L, { ...s, heading: 'Ordner 3', headingSize: 2 }), true);
});

test('Ohne Ueberschrift gibt es nichts zu beanstanden', () => {
  const L = computeLayout(mit('bogen4'));
  assert.equal(headingFits(L, { heading: '', headingSize: 99 }), true);
  assert.equal(headingFits(L, { heading: '   ', headingSize: 99 }), true);
  assert.equal(headingFits(L, { headingSize: 99 }), true);
});

test('Hoehenkorrektur 0 ergibt exakt die bisherigen Positionen', () => {
  const s = mit('bogen189');
  const L = computeLayout(s);
  nah(labelTop(L, s, 0, 0), 13.5);
  nah(labelTop(L, s, 0, 26), 273.5);
  nah(labelTop(L, s, 0, 26) + L.labH, 283.5);
  // fehlt das Feld ganz (alte gespeicherte Einstellungen), aendert sich nichts
  const ohne = { ...s }; delete ohne.heightAdjust;
  nah(labelTop(L, ohne, 0, 26), 273.5);
});

test('Minus 0,5 mm zieht die unterste Reihe um genau 0,5 mm hoch', () => {
  const s = { ...mit('bogen189'), heightAdjust: -0.5 };
  const L = computeLayout(s);
  nah(labelTop(L, s, 0, 0), 13.5, 0.001);     // oberste Reihe bleibt fest
  nah(labelTop(L, s, 0, 26), 273.0, 0.001);
});

test('Plus 1 mm schiebt die unterste Reihe um genau 1 mm nach unten', () => {
  const s = { ...mit('bogen189'), heightAdjust: 1 };
  const L = computeLayout(s);
  nah(labelTop(L, s, 0, 0), 13.5, 0.001);
  nah(labelTop(L, s, 0, 26), 274.5, 0.001);
});

test('Die Korrektur verteilt sich gleichmaessig ueber die Reihen', () => {
  const s = { ...mit('bogen189'), heightAdjust: -2.6 };   // 0,1 mm je Zeilenabstand
  const L = computeLayout(s);
  nah(labelTop(L, s, 0, 13), 13.5 + 13 * (10 - 0.1), 0.001);
  nah(labelTop(L, s, 0, 26), 273.5 - 2.6, 0.001);
});

test('Mehrere Abschnitte: die Korrektur wirkt ueber den ganzen Block', () => {
  const s0 = mit('bogen4');
  const L = computeLayout(s0);
  nah(labelTop(L, s0, 0, 0), 2.35);
  nah(labelTop(L, s0, 3, 6), 284.65);
  const s1 = { ...s0, heightAdjust: -1 };
  nah(labelTop(L, s1, 0, 0), 2.35, 0.001);
  nah(labelTop(L, s1, 3, 6), 283.65, 0.001);
});

test('Breitenkorrektur 0 und Versatz 0 ergeben die bisherigen Positionen', () => {
  const s = mit('bogen189');
  const L = computeLayout(s);
  nah(labelLeft(L, s, 0), 8.6);
  nah(labelLeft(L, s, 6), 176.0);
  nah(labelLeft(L, s, 6) + L.labW, 201.4);
  const ohne = { ...s }; delete ohne.widthAdjust; delete ohne.offsetX;
  nah(labelLeft(L, ohne, 6), 176.0);
});

test('Breitenkorrektur laesst die linke Spalte fest', () => {
  const s = { ...mit('bogen189'), widthAdjust: -0.6 };
  const L = computeLayout(s);
  nah(labelLeft(L, s, 0), 8.6, 0.001);
  nah(labelLeft(L, s, 6), 175.4, 0.001);
  nah(labelLeft(L, s, 3), 8.6 + 3 * (27.9 - 0.1), 0.001);   // 0,1 mm je Spaltenabstand
});

test('Versatz waagerecht verschiebt alle Spalten gleich', () => {
  const s = { ...mit('bogen189'), offsetX: 0.3 };
  const L = computeLayout(s);
  nah(labelLeft(L, s, 0), 8.9, 0.001);
  nah(labelLeft(L, s, 6), 176.3, 0.001);
});

test('Versatz und Breitenkorrektur wirken zusammen', () => {
  const s = { ...mit('bogen189'), offsetX: 0.3, widthAdjust: -0.6 };
  const L = computeLayout(s);
  nah(labelLeft(L, s, 0), 8.9, 0.001);
  nah(labelLeft(L, s, 6), 175.7, 0.001);
});

test('Alter Bogen: acht Spalten ohne Korrektur unveraendert', () => {
  const s = mit('bogen4');
  const L = computeLayout(s);
  nah(labelLeft(L, s, 0), 2.35);
  nah(labelLeft(L, s, 7), 182.25);
});

test('Passt der Bogen, bleibt es bei 100 Prozent', () => {
  assert.equal(fitZoom(1000, 210), 100);
  assert.equal(fitZoom(210 * 96 / 25.4, 210), 100, 'genau passend zaehlt als passend');
  assert.equal(fitZoom(793.7, 210), 99, 'ein Hauch zu schmal ergibt 99');
});

test('Bei Handybreite wird auf ganze Prozent abgerundet', () => {
  // 210 mm sind 793,7 CSS-Pixel; 390 / 793,7 = 49,1 Prozent
  assert.equal(fitZoom(390, 210), 49);
  assert.equal(fitZoom(600, 210), 75);
});

test('Der Zoom faellt nicht unter die Untergrenze von 25 Prozent', () => {
  assert.equal(fitZoom(100, 210), 25);
  assert.equal(fitZoom(1, 210), 25);
});

test('Unsinnige Eingaben ergeben 100 statt NaN', () => {
  assert.equal(fitZoom(0, 210), 100);
  assert.equal(fitZoom(390, 0), 100);
  assert.equal(fitZoom(NaN, 210), 100);
});

test('Kontrast gegen Weiss: die bekannten Eckwerte', () => {
  nah(kontrastZuWeiss('#000000'), 21.0, 0.01);
  nah(kontrastZuWeiss('#ffffff'), 1.0, 0.01);
});

test('Kraeftige Farben bleiben lesbar, helle nicht', () => {
  nah(kontrastZuWeiss('#c00000'), 6.48, 0.02);   // kraeftiges Rot
  nah(kontrastZuWeiss('#0000cc'), 11.22, 0.02);  // kraeftiges Blau
  nah(kontrastZuWeiss('#ffff00'), 1.07, 0.02);   // Gelb
  nah(kontrastZuWeiss('#bbbbbb'), 1.92, 0.02);   // helles Grau

  assert.equal(qrLesbar('#000000'), true);
  assert.equal(qrLesbar('#c00000'), true, 'Rot muss fuer den Abgleich taugen');
  assert.equal(qrLesbar('#0000cc'), true);
  assert.equal(qrLesbar('#ffff00'), false, 'Gelb kann kein Scanner lesen');
  assert.equal(qrLesbar('#bbbbbb'), false);
  assert.equal(qrLesbar('#888888'), false, 'mittleres Grau liegt mit 3,5:1 darunter');
});

test('Grossschreibung und fehlendes Doppelkreuz stoeren nicht', () => {
  nah(kontrastZuWeiss('#C00000'), kontrastZuWeiss('#c00000'), 0.001);
  nah(kontrastZuWeiss('c00000'), kontrastZuWeiss('#c00000'), 0.001);
});

test('Unbrauchbare Eingaben loesen keine falsche Warnung aus', () => {
  // Lieber schweigen als grundlos warnen: unlesbare Eingabe gilt als in Ordnung.
  assert.equal(qrLesbar(''), true);
  assert.equal(qrLesbar('rot'), true);
  assert.equal(qrLesbar(undefined), true);
});
