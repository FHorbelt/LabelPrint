// Voreinstellungen und mitgelieferte Bogenvorlagen.
// Die Werte der HERMA-Vorlage sind aus der PDF-Stanzvorlage ausgemessen.

export const DEFAULTS = {
  // Bogen
  pageW: 210, pageH: 297,
  secW: 192.8, secH: 270, secRows: 1, secGapY: 0,
  autoCenter: true, marginLeft: 1, marginTop: 1.25, heightAdjust: 0, widthAdjust: 0, offsetX: 0,
  safeMargin: 4.2, fitPrintable: false, showGuides: true,
  // Etikett
  labW: 25.4, labH: 10, gapX: 2.5, gapY: 0,
  labRadius: 1.1, qrPad: 0.6,
  fontSize: 2.5, prefixFontSize: 1.8,
  // Nummernkreis
  prefix: 'AR-', suffix: '', startNum: 1, padDigits: 6,
  qrTemplate: '{nr}', count: 189,
  // Darstellung
  showText: true, stackPrefix: true, showBorder: false,
  showPrefixOnLabel: true, labelText: '',
  heading: '', headingSize: 4
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
