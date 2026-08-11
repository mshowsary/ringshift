'use strict';
const test = require('node:test');
const assert = require('node:assert');

require('../js/i18n.js');
const RS = globalThis.RS;

test('setLocale maps BCP-47 tags to supported base languages', () => {
  const cases = [
    ['pt-BR', 'pt'],
    ['es-419', 'es'],
    ['fr-CA', 'fr'],
    ['de', 'de'],
    ['en-GB', 'en'],
    ['ja-JP', 'en'],
    ['zz', 'en'],
    [undefined, 'en'],
    [null, 'en'],
    ['', 'en'],
    ['ES', 'es']
  ];
  for (const [input, expected] of cases) {
    RS.i18n.setLocale(input);
    assert.strictEqual(RS.i18n.locale, expected, `setLocale(${String(input)})`);
  }
});

test('t returns localized strings after setLocale', () => {
  RS.i18n.setLocale('es');
  assert.strictEqual(RS.i18n.t('play'), 'Jugar');
  RS.i18n.setLocale('en');
  assert.strictEqual(RS.i18n.t('play'), 'Play');
});

test('every locale defines exactly the same keys as en', () => {
  const enKeys = Object.keys(RS.i18n.STRINGS.en).sort();
  assert.ok(enKeys.length >= 16, 'en must have the full key set');
  for (const locale of Object.keys(RS.i18n.STRINGS)) {
    const keys = Object.keys(RS.i18n.STRINGS[locale]).sort();
    assert.deepStrictEqual(keys, enKeys, `locale ${locale} key parity`);
  }
});

test('expected key set is present', () => {
  const required = ['loading', 'tagline', 'play', 'settings', 'music', 'sfx',
    'close', 'paused', 'resume', 'menu', 'gameOver', 'score', 'best',
    'newBest', 'playAgain', 'howtoHint'];
  for (const key of required) {
    assert.ok(key in RS.i18n.STRINGS.en, `missing key: ${key}`);
  }
});

test('t falls back to the key itself for unknown keys', () => {
  RS.i18n.setLocale('en');
  assert.strictEqual(RS.i18n.t('missing-key'), 'missing-key');
});

test('supported locale list is en/es/pt/fr/de', () => {
  assert.deepStrictEqual(Object.keys(RS.i18n.STRINGS).sort(), ['de', 'en', 'es', 'fr', 'pt']);
});
