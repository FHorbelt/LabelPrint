import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParts } from '../app/js/sheet.js';
import { DEFAULTS } from '../app/js/presets.js';

const mit = (o) => ({ ...DEFAULTS, ...o });

test('Beispiel: Praefix nur im Code, Name auf dem Etikett', () => {
  const p = buildParts(mit({
    prefix: 'ASN', suffix: '', startNum: 1, padDigits: 6,
    showPrefixOnLabel: false, labelText: 'Archiv'
  }), 0);
  assert.equal(p.full, 'ASN000001', 'QR-Inhalt behaelt das Praefix');
  assert.equal(p.labelTop, 'Archiv');
  assert.equal(p.numberPart, '000001');
  assert.equal(p.labelLine, 'Archiv 000001');
});

test('Vorgabe unveraendert: Praefix an, kein Zusatztext', () => {
  const p = buildParts(mit({ prefix: 'AR-', startNum: 1, padDigits: 6 }), 0);
  assert.equal(p.full, 'AR-000001');
  assert.equal(p.labelTop, 'AR-');
  assert.equal(p.labelLine, 'AR-000001', 'einzeilig ohne Leerzeichen wie bisher');
});

test('Praefix aus und kein Zusatztext: nur die Nummer', () => {
  const p = buildParts(mit({
    prefix: 'ASN', showPrefixOnLabel: false, labelText: '', startNum: 1, padDigits: 6
  }), 0);
  assert.equal(p.full, 'ASN000001');
  assert.equal(p.labelTop, '');
  assert.equal(p.labelLine, '000001');
});

test('beides gesetzt: Zusatztext vor Praefix', () => {
  const p = buildParts(mit({
    prefix: 'ASN', showPrefixOnLabel: true, labelText: 'Archiv', startNum: 1, padDigits: 6
  }), 0);
  assert.equal(p.labelTop, 'Archiv ASN');
  assert.equal(p.labelLine, 'Archiv ASN000001');
});

test('Suffix bleibt an der Nummer, auch im QR-Inhalt', () => {
  const p = buildParts(mit({
    prefix: 'ASN', suffix: '-X', showPrefixOnLabel: false, labelText: 'Archiv',
    startNum: 1, padDigits: 6
  }), 0);
  assert.equal(p.numberPart, '000001-X');
  assert.equal(p.full, 'ASN000001-X');
  assert.equal(p.labelLine, 'Archiv 000001-X');
});

test('alte gespeicherte Einstellungen ohne die neuen Felder zeigen das Praefix', () => {
  // showPrefixOnLabel und labelText fehlen voellig
  const p = buildParts({ prefix: 'AR-', suffix: '', startNum: 1, padDigits: 6 }, 0);
  assert.equal(p.labelTop, 'AR-');
  assert.equal(p.labelLine, 'AR-000001');
});

test('Zaehlrichtung bleibt: Index verschiebt die Nummer', () => {
  const s = mit({ prefix: 'ASN', showPrefixOnLabel: false, labelText: 'Archiv',
                  startNum: 190, padDigits: 6 });
  assert.equal(buildParts(s, 0).labelLine, 'Archiv 000190');
  assert.equal(buildParts(s, 5).labelLine, 'Archiv 000195');
  assert.equal(buildParts(s, 5).full, 'ASN000195');
});

test('Leerraum im Zusatztext erzeugt keine doppelten Leerzeichen', () => {
  const p = buildParts(mit({
    prefix: '  ', showPrefixOnLabel: true, labelText: '  Archiv  ',
    startNum: 1, padDigits: 6
  }), 0);
  assert.equal(p.labelTop, 'Archiv');
});
