# ASN-Drucker

Erzeugt maßhaltige QR-Etiketten für paperless-ngx-Archivnummern.

## Betrieb

`app/` ist die auslieferbare Wurzel. Ordner in ein statisches Verzeichnis
neben paperless-ngx legen, zum Beispiel als nginx-Volume. Kein Build-Schritt,
keine Laufzeitabhängigkeiten.

Lokal ausprobieren:

    cd app && python3 -m http.server 8099

**Die App braucht einen Webserver.** Ein Doppelklick auf `index.html`
funktioniert nicht: Browser blockieren ES-Module über `file://`. Das war bei
der früheren einteiligen Fassung noch möglich und ist der Preis für die
Aufteilung in Module.

Über http(s) ausgeliefert lässt sie sich installieren (Web App Manifest) und
läuft danach offline — der Service Worker legt die vollständige App-Schale in
einen versionierten Cache, die QR-Bibliothek liegt lokal unter `app/vendor/`.

## Tests

    node --test test/*.test.mjs   # Geometrie und Datenhaltung, 20 Tests
    node test/print-check.mjs     # Druckabnahme, braucht Google Chrome

Das Verzeichnis darf nicht ohne Muster übergeben werden — `node --test test/`
scheitert ab Node 24, weil der Pfad als Modul aufgelöst wird.

## Wichtig

Die Maße in `app/js/sheet.js` und `app/js/presets.js` sind gegen die
HERMA-Stanzvorlage vermessen (`Etiketten-Vorlage-HERMA-25-4x10-blanko.pdf`).
Änderungen dort müssen `test/geometry.test.mjs` bestehen. Verbindlich für die
Vorlage HERMA 4243/4244/4333:

| Größe | Sollwert |
|---|---|
| Raster | 7 × 27 = 189 |
| Etikett | 25,4 × 10 mm |
| Teilung | 27,9 mm waagerecht, 10,0 mm senkrecht |
| Erste Etikettenecke | 8,60 / 13,50 mm |
| Letzte Etikettenecke | 201,40 / 283,49 mm |
| Eckenradius | 1,1 mm |
| Kontur | #6F6E6E, 0,3 mm |

Für maßhaltigen Druck **Chrome** verwenden, Ränder auf „Keine", Skalierung
100 %. Safari ignoriert die Seitengröße aus dem Dokument und verkleinert
automatisch — die Etiketten sitzen dann zu hoch und die Maße stimmen nicht.

## Bekannte Einschränkungen

**Gedruckter Rahmen.** Die Option „Rahmen mitdrucken" (standardmäßig aus)
zeichnet die Etikettenkontur mit `outline` und negativem `outline-offset`. Am
Bildschirm sitzt sie exakt mittig auf der Stanzkante (gemessen 8,600 mm gegen
8,650 mm der Vorlage). In der gerasterten PDF-Ausgabe misst dieselbe Linie
0,45 mm statt 0,30 mm und sitzt nach innen versetzt. Ob das ein echter
Rendering-Unterschied im Druckpfad ist oder ein Artefakt der Messung — eine
0,3-mm-Linie sind bei der verwendeten Auflösung nur sieben Pixel — ist nicht
abschließend geklärt. Auf gestanzter Ware wird der Rahmen ohnehin nicht
gebraucht. **Die Etikettenpositionen sind davon nicht betroffen** und werden
von `test/print-check.mjs` abgesichert.

**Zähler ist gerätegebunden.** Der ASN-Zähler liegt im `localStorage` des
Browsers. Wer die App von zwei Geräten nutzt, bekommt auseinanderlaufende
Zähler. Bewusste Entscheidung gegen eine paperless-Anbindung, siehe Spec.

**Nicht bedruckbarer Rand.** Bleibt eine physische Grenze des Druckers. Bei
der HERMA-Vorlage unkritisch (8,6 bzw. 13,5 mm Rand), bei eigenen Vorlagen
warnt die App und zeigt den gemessenen Außenrand dauerhaft über der Vorschau.

## Aufbau

    app/index.html          Oberfläche
    app/css/app.css         Gestaltung, Hell/Dunkel
    app/js/sheet.js         Geometrie — rein rechnend, kein DOM
    app/js/presets.js       Vorlagen
    app/js/store.js         localStorage
    app/js/render.js        Zeichnen, QR mit Cache
    app/js/print.js         Druckdokument
    app/js/ui.js            Formular ↔ Zustand
    app/js/main.js          Verdrahtung
    docs/superpowers/       Spec und Implementierungsplan
    legacy/                 frühere einteilige Fassung als Referenz
