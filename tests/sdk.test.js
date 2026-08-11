'use strict';
const test = require('node:test');
const assert = require('node:assert');

require('../js/sdk.js');
const RS = globalThis.RS;

function freshSdk() {
  delete globalThis.ytgame;
  RS.sdk._reset();
}

function fakeYtgame(overrides) {
  const calls = { loadData: 0, saveData: [], firstFrameReady: 0, gameReady: 0, sendScore: [], logError: 0 };
  const yt = {
    IN_PLAYABLES_ENV: true,
    game: {
      loadData: () => { calls.loadData++; return Promise.resolve('{"v":1,"best":7}'); },
      saveData: (s) => { calls.saveData.push(s); return Promise.resolve(); },
      firstFrameReady: () => { calls.firstFrameReady++; },
      gameReady: () => { calls.gameReady++; }
    },
    system: {
      getLanguage: () => Promise.resolve('es-419'),
      isAudioEnabled: () => false,
      onAudioEnabledChange: (cb) => () => {},
      onPause: (cb) => () => {},
      onResume: (cb) => () => {}
    },
    engagement: {
      sendScore: (s) => { calls.sendScore.push(s); return Promise.resolve(); }
    },
    health: {
      logError: () => { calls.logError++; },
      logWarning: () => {}
    }
  };
  if (overrides) {
    for (const ns of Object.keys(overrides)) Object.assign(yt[ns], overrides[ns]);
  }
  globalThis.ytgame = yt;
  RS.sdk._reset();
  return calls;
}

// ---------- saveCodec ----------

test('parse of empty/garbage inputs returns fresh defaults', () => {
  for (const input of [undefined, null, '', 'garbage', '{}', '[]', '42']) {
    const out = RS.saveCodec.parse(input);
    assert.deepStrictEqual(out, RS.saveCodec.DEFAULTS, `input: ${String(input)}`);
    assert.notStrictEqual(out, RS.saveCodec.DEFAULTS, 'must be a copy, not the shared object');
  }
});

test('parse keeps known fields and defaults the rest', () => {
  const out = RS.saveCodec.parse('{"v":1,"best":42}');
  assert.strictEqual(out.best, 42);
  assert.strictEqual(out.music, RS.saveCodec.DEFAULTS.music);
  assert.strictEqual(out.tutorialSeen, false);
});

test('parse preserves unknown fields (forward compatibility)', () => {
  const out = RS.saveCodec.parse('{"v":1,"zz":9}');
  assert.strictEqual(out.zz, 9);
});

test('parse coerces invalid field types to defaults', () => {
  const out = RS.saveCodec.parse('{"best":"nope","music":"x","sfx":7,"gamesPlayed":-3,"tutorialSeen":1}');
  assert.strictEqual(out.best, 0);
  assert.strictEqual(out.music, RS.saveCodec.DEFAULTS.music);
  assert.strictEqual(out.sfx, RS.saveCodec.DEFAULTS.sfx);
  assert.strictEqual(out.gamesPlayed, 0);
  assert.strictEqual(out.tutorialSeen, true);
});

test('parse floors numeric strings that are valid numbers for best', () => {
  const out = RS.saveCodec.parse('{"best":"99"}');
  assert.strictEqual(out.best, 99);
});

test('serialize/parse round-trips', () => {
  const obj = RS.saveCodec.parse('{"v":1,"best":10,"totalGems":5}');
  const str = RS.saveCodec.serialize(obj);
  assert.strictEqual(typeof str, 'string');
  assert.deepStrictEqual(RS.saveCodec.parse(str), obj);
});

// ---------- sdk outside env ----------

test('outside env: inEnv false, lifecycle calls are safe no-ops', async () => {
  freshSdk();
  assert.strictEqual(RS.sdk.inEnv, false);
  assert.doesNotThrow(() => RS.sdk.firstFrameReady());
  assert.doesNotThrow(() => RS.sdk.gameReady());
  await assert.doesNotReject(() => RS.sdk.sendScore(5));
});

test('outside env: init resolves with default-shaped save and lang en', async () => {
  freshSdk();
  const { save, lang } = await RS.sdk.init();
  assert.strictEqual(lang, 'en');
  assert.strictEqual(typeof save.best, 'number');
  assert.strictEqual(save.v, 1);
});

// ---------- sdk inside env ----------

test('in env: init calls loadData and getLanguage, resolves parsed save + lang', async () => {
  const calls = fakeYtgame();
  const { save, lang } = await RS.sdk.init();
  assert.strictEqual(calls.loadData, 1);
  assert.strictEqual(save.best, 7);
  assert.strictEqual(lang, 'es-419');
});

test('in env: save() before init resolution does not call saveData', async () => {
  const calls = fakeYtgame();
  await RS.sdk.save({ best: 1 });
  assert.strictEqual(calls.saveData.length, 0);
  await RS.sdk.init();
  await RS.sdk.save({ best: 2 });
  assert.strictEqual(calls.saveData.length, 1);
  assert.match(calls.saveData[0], /"best":2/);
});

test('in env: sendScore floors and clamps to non-negative integer', async () => {
  const calls = fakeYtgame();
  await RS.sdk.init();
  await RS.sdk.sendScore(12.7);
  await RS.sdk.sendScore(-5);
  await RS.sdk.sendScore(NaN);
  assert.deepStrictEqual(calls.sendScore, [{ value: 12 }, { value: 0 }, { value: 0 }]);
});

test('in env: sendScore rejection is swallowed', async () => {
  fakeYtgame({ engagement: { sendScore: () => Promise.reject(undefined) } });
  await RS.sdk.init();
  await assert.doesNotReject(() => RS.sdk.sendScore(3));
});

test('in env: firstFrameReady only ever fires once', async () => {
  const calls = fakeYtgame();
  RS.sdk.firstFrameReady();
  RS.sdk.firstFrameReady();
  assert.strictEqual(calls.firstFrameReady, 1);
});

test('in env: gameReady enforces firstFrameReady first', async () => {
  const calls = fakeYtgame();
  RS.sdk.gameReady();
  assert.strictEqual(calls.firstFrameReady, 1);
  assert.strictEqual(calls.gameReady, 1);
  RS.sdk.gameReady();
  assert.strictEqual(calls.gameReady, 1);
});

test('in env: getLanguage rejection falls back to en', async () => {
  fakeYtgame({ system: { getLanguage: () => Promise.reject(undefined) } });
  const { lang } = await RS.sdk.init();
  assert.strictEqual(lang, 'en');
});

test('in env: loadData rejection falls back to defaults and still allows saving', async () => {
  const calls = fakeYtgame({ game: { loadData: () => Promise.reject(undefined) } });
  const { save } = await RS.sdk.init();
  assert.deepStrictEqual(save, RS.saveCodec.DEFAULTS);
  await RS.sdk.save(save);
  assert.strictEqual(calls.saveData.length, 1);
});

test('in env: saveData rejection is swallowed', async () => {
  fakeYtgame({ game: { saveData: () => Promise.reject(undefined) } });
  await RS.sdk.init();
  await assert.doesNotReject(() => RS.sdk.save({ best: 1 }));
});

test('event registration passes through and returns unsubscribe', async () => {
  freshSdk();
  const un1 = RS.sdk.onPause(() => {});
  const un2 = RS.sdk.onResume(() => {});
  const un3 = RS.sdk.onAudioEnabledChange(() => {});
  assert.strictEqual(typeof un1, 'function');
  assert.strictEqual(typeof un2, 'function');
  assert.strictEqual(typeof un3, 'function');
  assert.strictEqual(RS.sdk.isAudioEnabled(), true);
});

test('in env: isAudioEnabled reflects ytgame', async () => {
  fakeYtgame();
  assert.strictEqual(RS.sdk.isAudioEnabled(), false);
});
