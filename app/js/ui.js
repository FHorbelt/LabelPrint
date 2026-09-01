// Verbindet Formular und Einstellungsobjekt. Kein Zustands-Container:
// alle Felder fuettern dasselbe eine Objekt.

import { DEFAULTS } from './presets.js';

const $ = (id) => document.getElementById(id);

export const FIELDS = Object.keys(DEFAULTS);

const CHECKBOXES = new Set([
  'autoCenter', 'fitPrintable', 'showGuides', 'showText', 'stackPrefix', 'showBorder',
  'showPrefixOnLabel'
]);
const TEXTS = new Set(['prefix', 'suffix', 'qrTemplate', 'labelText', 'heading']);

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
  if (String(s.heading ?? '').trim() !== '') zahl('headingSize', 'Schriftgröße Überschrift', 0.1);
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
