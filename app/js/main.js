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
