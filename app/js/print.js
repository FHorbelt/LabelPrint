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
