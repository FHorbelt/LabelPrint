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
