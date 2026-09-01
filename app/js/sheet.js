// Geometrie des Etikettenbogens. Rein rechnend, kein DOM — deshalb in Node
// testbar. Die Zahlen dieser Datei sind gegen die Stanzvorlage vermessen;
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

// Zoomstufe in Prozent, bei der ein Bogen in die verfuegbare Breite passt.
// Passt er ohnehin, bleibt es bei 100. Abgerundet auf ganze Prozent, damit
// nichts an der Kante klemmt; die Untergrenze entspricht der des Zoomreglers.
export function fitZoom(verfuegbarPx, seitenBreiteMm) {
  const seitePx = seitenBreiteMm * 96 / 25.4;
  if (!(verfuegbarPx > 0) || !(seitePx > 0)) return 100;
  if (seitePx <= verfuegbarPx) return 100;
  return Math.max(25, Math.floor(verfuegbarPx / seitePx * 100));
}

// Senkrechte Position der Oberkante einer Etikettenreihe, in Millimetern von
// der Blattoberkante.
//
// `heightAdjust` gleicht Drucker aus, die minimal zu gross oder zu klein
// abbilden: die oberste Reihe bleibt fest, alles darunter wird gleichmaessig
// gestreckt oder gestaucht, sodass sich der Abstand zwischen oberster und
// unterster Reihe um genau diesen Betrag aendert. Die Etikettenhoehe selbst
// bleibt unberuehrt — sie entspricht der Stanzung, nur die Positionen driften.
export function labelTop(L, s, sec, r) {
  const ersteOben = L.marginTop + L.freeH / 2;
  const spanne = (L.secRows - 1) * (L.secH + L.secGapY) + (L.rows - 1) * (L.labH + L.gapY);
  const korrektur = parseFloat(s.heightAdjust);
  const k = (spanne > 0 && Number.isFinite(korrektur)) ? (spanne + korrektur) / spanne : 1;
  return ersteOben + k * (sec * (L.secH + L.secGapY) + r * (L.labH + L.gapY));
}

// Waagerechte Position der linken Kante einer Etikettenspalte, in Millimetern
// von der linken Blattkante.
//
// Spiegelbildlich zu labelTop, aber mit zwei Stellschrauben: `widthAdjust`
// streckt oder staucht von der linken Spalte aus (gegen Aufsummierung nach
// rechts), `offsetX` verschiebt alle Spalten gemeinsam (gegen einen Versatz,
// der schon die linke Spalte betrifft).
export function labelLeft(L, s, c) {
  const ersteLinks = L.marginLeft + L.freeW / 2;
  const spanne = (L.cols - 1) * (L.labW + L.gapX);
  const korrektur = parseFloat(s.widthAdjust);
  const k = (spanne > 0 && Number.isFinite(korrektur)) ? (spanne + korrektur) / spanne : 1;
  const versatz = parseFloat(s.offsetX);
  return ersteLinks + (Number.isFinite(versatz) ? versatz : 0) + k * (c * (L.labW + L.gapX));
}

// Abstaende der aeussersten Etikettenkanten zum Blattrand — mit den
// Korrekturen gerechnet, damit die Randwarnung nicht luegt.
export function correctedInkBottom(L, s) {
  return L.pageH - (labelTop(L, s, L.secRows - 1, L.rows - 1) + L.labH);
}

export function correctedInkLeft(L, s) {
  return labelLeft(L, s, 0);
}

export function correctedInkRight(L, s) {
  return L.pageW - (labelLeft(L, s, L.cols - 1) + L.labW);
}

// Die Ueberschrift steht im freien Streifen zwischen Blattoberkante und der
// ersten Etikettenreihe. Dessen Hoehe ist genau `inkTop`. Passt die Schrift
// nicht hinein, wird gewarnt statt stillschweigend abgeschnitten.
export function headingFits(L, s) {
  const text = String(s.heading ?? '').trim();
  if (text === '') return true;
  const groesse = parseFloat(s.headingSize);
  if (!Number.isFinite(groesse)) return true;   // ungueltige Zahl faengt validate() ab
  return groesse <= L.inkTop;
}

// Seriennummer eines Etiketts. i ist der Index ab 0.
//
// Der QR-Inhalt (`full`) und die Aufschrift sind bewusst entkoppelt: der Code
// traegt immer die vollstaendige Nummer mit Praefix, waehrend auf dem Etikett
// das Praefix ausgeblendet und stattdessen ein freier Zusatztext stehen kann.
// Beispiel: Praefix "ASN", Zusatztext "Archiv", Praefix ausgeblendet
//   -> full "ASN000001", Aufschrift "Archiv" / "000001".
export function buildParts(s, i) {
  const prefix = String(s.prefix ?? '');
  const suffix = String(s.suffix ?? '');
  const labelText = String(s.labelText ?? '');
  // Fehlt das Feld (alte gespeicherte Einstellungen), wird das Praefix gezeigt.
  const zeigePrefix = s.showPrefixOnLabel !== false;

  const start = parseInt(s.startNum, 10) || 0;
  const pad = Math.max(1, parseInt(s.padDigits, 10) || 1);
  const num = (start + i).toString().padStart(pad, '0');
  const numberPart = `${num}${suffix}`;

  const zusatz = labelText.trim();
  const praefixAufEtikett = zeigePrefix ? prefix.trim() : '';

  // Obere Zeile der gestapelten Darstellung.
  const labelTop = [zusatz, praefixAufEtikett].filter(Boolean).join(' ');
  // Einzeilige Darstellung: das Praefix haengt ohne Leerzeichen an der Nummer,
  // der Zusatztext wird davon durch ein Leerzeichen getrennt.
  const labelLine = [zusatz, `${praefixAufEtikett}${numberPart}`].filter(Boolean).join(' ');

  return { prefix, numberPart, full: `${prefix}${numberPart}`, labelTop, labelLine };
}
