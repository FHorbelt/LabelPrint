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

    // Gestapelt nur, wenn die obere Zeile ueberhaupt etwas enthaelt.
    if (s.stackPrefix && parts.labelTop !== '') {
      txt.classList.add('stacked');
      const p = document.createElement('div');
      p.className = 'prefix-line';
      p.style.fontSize = `${s.prefixFontSize}mm`;
      p.textContent = parts.labelTop;
      txt.appendChild(p);

      const n = document.createElement('div');
      n.className = 'number-line';
      n.style.fontSize = `${s.fontSize}mm`;
      n.textContent = parts.numberPart;
      txt.appendChild(n);
    } else {
      txt.style.fontSize = `${s.fontSize}mm`;
      txt.textContent = parts.labelLine;
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
      // Mindestens ein Auftrag je Frame: ist die Uhr beim Eintritt schon ueber
      // der Frist, verarbeitet eine reine while-Schleife nichts und plant sich
      // endlos neu — die Vorschau bliebe ohne QR-Codes stehen, ohne Fehler und
      // ohne Drucksperre. Deshalb do/while.
      const bis = performance.now() + 12;
      do {
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
      } while (i < auftraege.length && performance.now() < bis);
      if (i < auftraege.length) {
        setTimeout(scheibe, 0);
      } else {
        resolve({ pages, drawn: i, failed });
      }
    };
    // Bewusst setTimeout statt requestAnimationFrame: rAF pausiert vollstaendig,
    // sobald der Tab in den Hintergrund geht oder der Rahmen nicht sichtbar ist.
    // Dann wuerden Etiketten ohne QR-Code stehenbleiben, ohne dass `done` je
    // ausloest — also ohne Warnung und ohne Drucksperre. Die Fluessigkeit kommt
    // aus der 12-ms-Zeitscheibe, nicht aus dem Bildtakt.
    setTimeout(scheibe, 0);
  });

  return { cancel() { abgebrochen = true; }, done };
}
