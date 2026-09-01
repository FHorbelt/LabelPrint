// Druckabnahme: startet Headless Chrome gegen einen lokalen Server, laesst die
// App zeichnen, misst die Etikettenpositionen im DOM und prueft sie gegen die
// aus der Stanzvorlage vermessenen Sollwerte.
//
// Voraussetzung: Google Chrome installiert. Der Server wird selbst gestartet;
// ein Dateipfad reicht nicht, weil ES-Module ueber file:// blockiert sind.

import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const PORT = process.env.PORT || 8137;

const messSeite = `<!DOCTYPE html><meta charset="utf-8"><body><pre id="out">…</pre>
<script>
  const f = document.createElement('iframe');
  f.style.cssText = 'width:1400px;height:1000px;border:0;position:absolute;left:-99999px';
  document.body.appendChild(f);
  f.src = 'index.html';
  f.onload = () => setTimeout(() => {
    const d = f.contentDocument, MM = 96 / 25.4;
    const labs = [...d.querySelectorAll('.label')];
    const fr = d.querySelector('.page-frame').getBoundingClientRect();
    const first = labs[0].getBoundingClientRect();
    const last = labs[labs.length - 1].getBoundingClientRect();
    const cs = f.contentWindow.getComputedStyle(labs[0]);
    document.getElementById('out').textContent = JSON.stringify({
      anzahl: labs.length,
      seiten: d.querySelectorAll('.page-frame').length,
      fehlerhaft: d.querySelectorAll('.label.qr-failed').length,
      ersteLinks: +((first.left - fr.left) / MM).toFixed(2),
      ersteOben: +((first.top - fr.top) / MM).toFixed(2),
      letzteRechts: +((last.right - fr.left) / MM).toFixed(2),
      letzteUnten: +((last.bottom - fr.top) / MM).toFixed(2),
      radiusPx: parseFloat(cs.borderTopLeftRadius),
      kontur: cs.outlineColor,
      konturBreite: cs.outlineWidth,
      seitenBox: d.getElementById('pageStyle').textContent.trim()
    });
  }, 5000);
</script>`;

writeFileSync(join(APP_DIR, '__abnahme.html'), messSeite);

const server = spawn(process.execPath, ['-e', `
  const http = require('http'), fs = require('fs'), path = require('path');
  const typen = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
                  '.json':'application/json', '.webmanifest':'application/manifest+json',
                  '.png':'image/png' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = path.join(${JSON.stringify(APP_DIR)}, p);
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': typen[path.extname(f)] || 'application/octet-stream' });
      res.end(d);
    });
  }).listen(${PORT}, '127.0.0.1');
`], { stdio: 'ignore' });

const aufraeumen = () => {
  server.kill();
  try { rmSync(join(APP_DIR, '__abnahme.html')); } catch { /* egal */ }
};

try {
  await new Promise((r) => setTimeout(r, 700));

  const dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--virtual-time-budget=20000',
    '--dump-dom', `http://127.0.0.1:${PORT}/__abnahme.html`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

  const roh = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const m = JSON.parse(roh);
  console.log('Gemessen:', m);

  const nah = (ist, soll, tol, name) =>
    assert.ok(Math.abs(ist - soll) <= tol, `${name}: ${ist} statt ${soll} (Toleranz ${tol})`);

  assert.equal(m.anzahl, 189, 'Etikettenzahl');
  assert.equal(m.seiten, 1, 'Seitenzahl');
  assert.equal(m.fehlerhaft, 0, 'fehlerhafte QR-Codes');
  nah(m.ersteLinks, 8.6, 0.02, 'erste Ecke links');
  nah(m.ersteOben, 13.5, 0.02, 'erste Ecke oben');
  nah(m.letzteRechts, 201.4, 0.02, 'letzte Ecke rechts');
  nah(m.letzteUnten, 283.5, 0.05, 'letzte Ecke unten');
  nah(m.radiusPx, 1.1 * 96 / 25.4, 0.1, 'Eckenradius');
  assert.equal(m.kontur, 'rgb(111, 110, 110)', 'Konturfarbe #6F6E6E');
  assert.equal(m.seitenBox, '@page{size:210mm 297mm; margin:0;}', 'Seitenbox');

  // Zweiter Teil: seit der Druck direkt aus der Seite laeuft, wird er hier
  // auch wirklich erzeugt. Prueft, dass der @media-print-Block das Blatt
  // allein uebrig laesst und die Seitenbox stimmt.
  const pdfDatei = join(mkdtempSync(join(tmpdir(), 'asn-')), 'druck.pdf');
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    '--virtual-time-budget=25000', `--print-to-pdf=${pdfDatei}`,
    `http://127.0.0.1:${PORT}/index.html`
  ], { stdio: 'ignore' });

  const pdf = readFileSync(pdfDatei);
  const seiten = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || [];
  const boxen = new Set((pdf.toString('latin1').match(/\/MediaBox\s*\[([^\]]*)\]/g) || []));
  rmSync(pdfDatei, { force: true });

  console.log('Gedruckt:', { seiten: seiten.length, mediaBox: [...boxen] });
  assert.equal(seiten.length, 1, 'gedruckte Seitenzahl');
  assert.equal(boxen.size, 1, 'einheitliche Seitenbox');
  // 210 x 297 mm in Punkt, mit der Rundung, die Chrome erzeugt
  assert.match([...boxen][0], /594\.9\d* 841\.9\d*/, 'Seitenbox ist A4 hoch');

  console.log('Druckabnahme bestanden.');
} finally {
  aufraeumen();
}
