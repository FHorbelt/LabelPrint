# ASN-Drucker als Webapp — Design

Stand: 2026-08-31

## 1. Ziel

Der Etiketten-Generator ist heute eine einzelne HTML-Datei mit 828 Zeilen und 26
Bedienelementen in vier gleichrangigen Blöcken. Er erzeugt maßhaltige
QR-Etiketten für paperless-ngx-Archivnummern auf HERMA-Bogen.

Er soll eine installierbare, offline lauffähige Webapp werden, die neben
paperless-ngx auf dem Server liegt: mit fortgeführtem ASN-Zähler, eigenen
Bogenvorlagen und einer Oberfläche, die den Alltag (Nummer prüfen, Anzahl
setzen, drucken) von der Einrichtung trennt.

Die vermessene Druckgeometrie ist das Wertvollste am bestehenden Stand und darf
sich durch den Umbau **nicht** ändern. Sie ist in Abschnitt 10 als
Abnahmekriterium festgehalten.

## 2. Getroffene Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Betrieb | Ausgeliefert über http(s) neben paperless-ngx | Nur so funktionieren Service Worker; Voraussetzung für Installation und Offline |
| paperless-Anbindung | Keine | Kein API-Token im Browser, keine CORS-Konfiguration, keine Kopplung. Zähler bleibt lokal |
| Druckhistorie | Schlichte Liste der Läufe | Anforderung ist „wissen, wo ich stehe", nicht Nachdruck oder Lückenanalyse |
| Technik | Statische Dateien, kein Build-Schritt | Ein Werkzeug dieser Größe soll ohne Toolchain änderbar bleiben |
| Layout | Seitenleiste mit Aufklapp-Gruppen | Alles an einem Ort auffindbar; Alltagsfelder offen, Einrichtung zugeklappt |
| Zähler-Fortschreibung | Beim Auslösen des Drucks, mit „Rückgängig" | Kein Bestätigungsdialog im Alltag; Fehldruck bleibt korrigierbar |

Verworfen: Vite mit Preact/Svelte (Build-Kette steht in keinem Verhältnis),
Alles-in-einer-Datei (der Service Worker muss ohnehin separat sein, und die
Datei würde auf geschätzt 1500+ Zeilen wachsen).

## 3. Dateistruktur

```
asn-drucker/
  index.html                Markup der Oberfläche
  css/app.css               Gestaltung, Design-Tokens, Hell/Dunkel
  js/
    sheet.js                Geometrie — rein rechnend, kein DOM
    presets.js              mitgelieferte Vorlagen + Verwaltung eigener
    render.js               Bogen als DOM zeichnen, QR-Erzeugung mit Cache
    print.js                Druckdokument bauen und öffnen
    store.js                localStorage: Einstellungen, Vorlagen, Verlauf
    ui.js                   Formular <-> Zustand, Gruppen, Dialoge, Validierung
    main.js                 Start, verdrahtet die Module
  vendor/qrcode.min.js      lokal statt CDN
  sw.js                     Service Worker
  manifest.webmanifest
  icons/icon-192.png  icon-512.png  icon-maskable-512.png
  test/geometry.test.mjs
  test/store.test.mjs
```

Deployment: Ordner in ein statisches Verzeichnis neben paperless-ngx legen
(z. B. nginx-Volume). Kein Build, kein `node_modules` zur Laufzeit.

## 4. Module

Jedes Modul hat eine Aufgabe, eine benannte Schnittstelle und bekannte
Abhängigkeiten.

### sheet.js — Geometrie

Übernimmt `computeLayout`, `pageRule` und `sheetCSS` **wörtlich** aus der
bestehenden Datei. Rein rechnend, kein DOM-Zugriff, dadurch in Node testbar.

```js
computeLayout(input) -> Layout   // input: alle Maßfelder als Objekt
pageRule(L) -> string            // "@page{size:210mm 297mm; margin:0;}"
sheetCSS(L) -> string            // vollständiges Druck-Stylesheet
```

`Layout` enthält wie heute `cols`, `rows`, `perSection`, `perPage`,
`marginLeft/Top`, `freeW/H` sowie `inkLeft/Right/Top/Bottom` (Abstand der
äußersten Etikettenkante zum Blattrand) und die Einpass-Angaben `safeMargin`,
`fitPrintable`.

Abhängigkeiten: keine.

### presets.js — Vorlagen

Hält die mitgelieferten Vorlagen und verwaltet eigene.

```js
BUILTIN                          // herma4333, bogen4
listTemplates() -> Template[]    // mitgeliefert + eigene aus store
saveTemplate(t) / deleteTemplate(id)
applyTemplate(id) -> Settings    // Werte, die ins Formular gespielt werden
```

Mitgeliefert bleiben die beiden bestehenden: `herma4333` (HERMA
4243/4244/4333) und `bogen4` (208 × 73,5 mm, 4 Abschnitte). Eigene Vorlagen
sind dieselbe Struktur mit eigener `id` und einem Namen.

Abhängigkeiten: `store.js`.

### render.js — Zeichnen

```js
renderSheets(container, L, settings) -> RenderHandle
qrSVG(data, sizeMM) -> string    // mit Cache je (data, sizeMM)
```

Zeichnet Seiten, Abschnittsrahmen, Markierung des bedruckbaren Bereichs und
Etiketten. `RenderHandle` bietet `cancel()`, damit ein laufender Durchgang
abgebrochen wird, wenn schneller getippt wird als gezeichnet.

Zweistufig (siehe Abschnitt 9): Rahmen und Positionen sofort, QR-Codes in
Zeitscheiben nach.

Abhängigkeiten: `vendor/qrcode.min.js`.

### print.js — Druck

```js
openPrintTab(L, pagesHTML, settings) -> boolean
```

Baut das Druckdokument aus `sheetCSS(L)` und dem gezeichneten Bogen und
schreibt es per `document.write` in einen neuen Tab (kein `blob:`; das war der
Safari-Fehler). Gibt `false` zurück, wenn der Tab blockiert wurde.

Abhängigkeiten: `sheet.js`.

### store.js — Datenhaltung

```js
loadSettings() / saveSettings(s)
listRuns() -> Run[]
addRun(run) / undoLastRun()
nextAsn() -> number              // abgeleitet aus listRuns()
listUserTemplates() / saveUserTemplate(t) / deleteUserTemplate(id)
isAvailable() -> boolean
```

Einziges Modul, das `localStorage` kennt. Jeder Zugriff in `try/catch`.

### ui.js — Oberfläche

Liest das Formular in ein Einstellungsobjekt und schreibt es zurück, steuert
Aufklapp-Gruppen, Vorlagenmenü, Verlaufs-Einblendung, Feldvalidierung und den
Hell/Dunkel-Umschalter. Kein Zustands-Container: bei 26 Feldern, die alle
dasselbe Objekt füttern, wäre das Zeremonie ohne Nutzen.

### main.js — Verdrahtung

Startet die App, lädt Einstellungen, registriert den Service Worker, verbindet
Formularereignisse mit `render` und `print`.

## 5. Oberfläche

Zweispaltig: Seitenleiste links, Vorschau rechts.

**Kopfzeile:** App-Name, Vorlagen-Menü (Wechseln, Eigene anlegen, Verwalten),
Statuszeile („189 Etiketten · 1 Seite"), Hell/Dunkel-Umschalter,
Drucken-Schaltfläche.

**Seitenleiste, von oben:**

1. **Statuskarte** — „Weiter bei AR-000190", darunter der letzte Lauf und ein
   Link zum Verlauf. Ein Klick übernimmt die Nummer ins Feld Startnummer.
2. **Nummernkreis** (offen) — Präfix, Suffix, Startnummer, Stellen, Anzahl
   (mit „1 Seite füllen"), QR-Inhalt-Vorlage.
3. **Bogen** (zugeklappt) — Seitenmaße, Abschnitte, Zentrieren bzw. manuelle
   Ränder, nicht bedruckbarer Rand, Einpassen.
4. **Etikett** (zugeklappt) — Breite, Höhe, Abstände, Eckenradius,
   Schriftgrößen, QR-Rand innen.
5. **Darstellung** (zugeklappt) — Seriennummer als Text, Präfix eigene Zeile,
   Rahmen mitdrucken, Hilfslinien anzeigen.

**Über der Vorschau:** Zoom, Seitenzähler, und rechts der gemessene Außenrand
als Dauerkontrolle („Rand außen 8,60 / 13,50 mm").

Der Verlauf erscheint als Einblendung über dem Vorschaubereich, nicht als
eigener Bereich — er wird selten gebraucht.

Hell und Dunkel folgen der Systemeinstellung, per Umschalter übersteuerbar.
Unterhalb von 900 px Breite klappt die Seitenleiste über die Vorschau, damit
die App auf dem Tablet bedienbar bleibt.

Der Knopf „Vorschau aktualisieren" entfällt (siehe Abschnitt 9).

## 6. Datenhaltung

Alles unter `asn.*` in `localStorage`:

| Schlüssel | Inhalt |
|---|---|
| `asn.settings` | alle Formularwerte als ein Objekt |
| `asn.templates` | eigene Bogenvorlagen |
| `asn.history` | Druckläufe: `{ ts, prefix, suffix, from, to, count, template }` |
| `asn.ui` | offene Gruppen, Zoom, Hell/Dunkel |

Der Zähler wird **nicht** getrennt gespeichert, sondern aus `asn.history`
abgeleitet: höchste vergebene Nummer plus eins. Ein Wert weniger, der
auseinanderlaufen kann.

`asn.history` wird auf die letzten 200 Läufe begrenzt.

**Fortschreibung:** Beim Auslösen des Drucks wird der Lauf in `asn.history`
geschrieben. Der Verlauf bietet für den jeweils letzten Lauf „Rückgängig", was
ihn entfernt und den Zähler zurücksetzt. Damit ist der Fehldruck abgedeckt,
ohne bei jedem Bogen einen Bestätigungsdialog zu zeigen.

## 7. Offline und Installation

`sw.js` legt beim Installieren die vollständige App-Schale in einen
versionierten Cache (`asn-v<N>`) und bedient danach Cache-first. Zur Laufzeit
ist kein Netz nötig, weil die QR-Bibliothek lokal liegt. Beim Aktivieren werden
Caches anderer Versionen gelöscht.

Zwischengespeichert werden: `index.html`, `css/app.css`, alle Dateien unter
`js/`, `vendor/qrcode.min.js`, `manifest.webmanifest` und die Icons.

Wartet eine neue Fassung, zeigt die App eine schmale Leiste „Neue Version
verfügbar — neu laden".

`manifest.webmanifest`: `name` „ASN-Drucker", `short_name` „ASN",
`start_url: "."`, `scope: "."`, `display: "standalone"`, `theme_color` und
`background_color` passend zur Gestaltung, Icons in 192 und 512 sowie ein
maskierbares in 512.

## 8. Fehlerfälle

**QR-Erzeugung schlägt fehl.** Heute wirft `render()` mitten in der Schleife,
nachdem `pagesWrap` bereits geleert wurde — der Bogen bleibt leer und der
Druckknopf druckt klaglos eine leere Seite. Neu: die Erzeugung je Etikett wird
abgesichert; scheitert sie, zeichnet die App einen Platzhalter mit
Fehlmarkierung, blendet eine Warnung ein und **sperrt den Druckknopf**. Eine
leere Seite darf nie wieder unbemerkt gedruckt werden.

**Ungültige Zahlenfelder.** Heute macht `num()` daraus stillschweigend 0, was
`Math.max(1, …)` auffängt, ohne dass die Ursache sichtbar wird. Neu: Hinweis am
Feld, das Feld wird markiert, die Vorschau behält den letzten gültigen Stand.

**Layout passt nicht auf die Seite.** Die bestehende Warnung bleibt; der Druck
verlangt in diesem Fall eine Bestätigung.

**Etiketten im nicht bedruckbaren Rand.** Bestehende Warnung und Anzeige der
gemessenen Ränder bleiben, jetzt dauerhaft über der Vorschau sichtbar.

**`localStorage` nicht verfügbar** (privates Fenster, Speicher voll): Die App
läuft vollständig weiter, nur ohne Merken. Einmaliger Hinweis, kein
wiederholtes Nörgeln.

**Druck-Tab blockiert.** Bestehende Behandlung bleibt: Hinweis auf Pop-up-
Freigabe.

## 9. Leistung

189 QR-Codes neu zu rechnen ist der Grund für den heutigen Knopf „Vorschau
aktualisieren". Statt das dem Benutzer aufzubürden:

- Eingaben werden mit ~150 ms entprellt.
- Rahmen, Positionen und Maße zeichnen sofort.
- QR-Codes werden in Zeitscheiben nachgezogen; ein laufender Durchgang wird bei
  neuer Eingabe abgebrochen (`RenderHandle.cancel()`).
- Erzeugte SVGs werden je `(Nutzdaten, Größe)` zwischengespeichert. Ändert sich
  nur die Anzahl, wird nichts neu gerechnet.

## 10. Tests und Abnahme

**`test/geometry.test.mjs`** (`node --test`, ohne Browser, weil `sheet.js` rein
rechnend ist) hält die vermessenen Werte fest:

Für die Vorlage HERMA 4243/4244/4333:

| Größe | Sollwert |
|---|---|
| Raster | 7 × 27 = 189 |
| Etikett | 25,4 × 10 mm |
| Teilung | 27,9 mm waagerecht, 10,0 mm senkrecht |
| Abstände | 2,5 mm waagerecht, 0 mm senkrecht |
| Erste Etikettenecke | 8,60 / 13,50 mm |
| Letzte Etikettenecke | 201,40 / 283,49 mm |
| Ränder außen | 8,60 mm links/rechts, 13,50 mm oben/unten |
| Eckenradius | 1,1 mm |
| Seitenbox | `@page{size:210mm 297mm; margin:0;}` |

Weiter geprüft: die Vorlage `bogen4` liefert unverändert 8 × 7 = 224 mit Ecke
2,35 / 2,35 mm; „Einpassen" mit 4,2 mm reduziert auf 7 × 6 = 168; `pageRule`
folgt geänderten Seitenmaßen (nicht mehr fest A4).

**`test/store.test.mjs`**: Zähler aus leerer Historie, Fortschreibung,
Rückgängig, Begrenzung auf 200 Läufe, Verhalten bei nicht verfügbarem
`localStorage`.

**Manuelle Nachmessung** nach dem Umbau mit dem Verfahren aus der Entwicklung:
erzeugten Bogen über `Etiketten-Vorlage-HERMA-25-4x10-blanko.pdf` legen und
Kontur, Linienstärke (0,3 mm), Farbe (#6F6E6E) und Eckenradius vergleichen.
Zulässige Abweichung: 0,05 mm.

**Druckverhalten** bleibt geprüft: 189 Etiketten ergeben genau eine Seite,
500 Etiketten genau drei Seiten ohne Leerseite dahinter, Hilfslinien und graue
Kontur erscheinen nie im Druck.

## 11. Bewusst nicht enthalten

- Kein Zustands-Container und kein Reaktivitätssystem.
- Keine paperless-Anbindung, kein API-Token, keine CORS-Konfiguration.
- Kein Nachdruck früherer Läufe und keine Lückenanalyse der ASN-Bereiche.
- Kein Export/Import von Vorlagen. Kann später ergänzt werden, wird jetzt nicht
  gebraucht.
- Keine Mehrbenutzer- oder Synchronisationsfunktion.

## 12. Randbedingungen und Risiken

**Safari** ignoriert die Seitengröße aus dem Dokument und verkleinert
automatisch. Für maßhaltigen Druck bleibt Chrome die Empfehlung; der Hinweis im
Druckdokument bleibt erhalten. Der Umbau ändert daran nichts.

**Nicht bedruckbarer Rand des Druckers** bleibt eine physische Grenze. Bei der
HERMA-Vorlage unkritisch (8,6 bzw. 13,5 mm), bei eigenen Vorlagen warnt die App.

**`localStorage` ist an Browser und Gerät gebunden.** Nutzt du die App von
zwei Geräten, laufen die Zähler auseinander. Bewusst in Kauf genommen, weil die
Alternative die paperless-Anbindung wäre.

**Der Umbau ist ein Neuschnitt, kein Umbenennen.** Das Risiko liegt darin, beim
Verschieben Verhalten zu verlieren. Gegenmittel: `sheet.js` wird wörtlich
übernommen, und die Abnahmewerte in Abschnitt 10 sind vor dem Umbau als Test
festgeschrieben, nicht danach.
