'use strict';
const test = require('node:test');
const assert = require('node:assert');

require('../js/game.js');
const RS = globalThis.RS;
const C = RS.GAME_C;

// Deterministic LCG for reproducible spawns.
function mkRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stepFor(g, seconds, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) g.update(dt);
}

test('initial state: running, outer ring, score 0, multiplier 1', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  assert.strictEqual(g.state, 'running');
  assert.strictEqual(g.ship.ring, 1);
  assert.strictEqual(g.score, 0);
  assert.strictEqual(g.multiplier, 1);
});

test('time points accrue at 10/s', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  // No entities interfering: clear them each step.
  for (let i = 0; i < 10; i++) { g.update(1); g.entities.length = 0; }
  assert.ok(Math.abs(g.time - 10) < 1e-9);
  assert.strictEqual(g.score, 100);
});

test('hop switches ring after HOP_TIME, collision ring flips at half hop', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  assert.strictEqual(g.ship.ring, 1);
  g.hop();
  assert.ok(g.ship.hop.active);
  g.update(0.05);
  assert.strictEqual(g.effectiveRing(), 1, 'before half hop, still on origin ring');
  g.update(0.02);
  assert.strictEqual(g.effectiveRing(), 0, 'after half hop, on target ring');
  g.update(0.06);
  assert.strictEqual(g.ship.ring, 0);
  assert.ok(!g.ship.hop.active);
});

test('hop during active hop is ignored', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.hop();
  g.update(0.06);
  g.hop(); // should be ignored
  g.update(0.07);
  assert.strictEqual(g.ship.ring, 0);
  assert.ok(!g.ship.hop.active);
});

test('spawning: entities appear, ahead of ship within 1.2-2.6 rad', () => {
  const g = RS.createGame({ rng: mkRng(7) });
  const seen = [];
  for (let i = 0; i < 600 && seen.length < 8; i++) {
    const before = g.entities.length;
    const shipAngle = g.ship.angle;
    g.update(1 / 60);
    if (g.state !== 'running') break;
    for (let k = before; k < g.entities.length; k++) {
      const e = g.entities[k];
      let ahead = (e.angle - shipAngle) % (Math.PI * 2);
      if (ahead < 0) ahead += Math.PI * 2;
      seen.push({ kind: e.kind, ahead });
    }
  }
  assert.ok(seen.length > 0, 'entities spawned');
  for (const s of seen) {
    assert.ok(s.ahead >= 1.19 && s.ahead <= 2.61, `spawn ahead ${s.ahead.toFixed(2)} rad`);
  }
});

test('mines telegraph then arm after MINE_TELEGRAPH, emitting mine-armed', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'mine', ring: 0, angle: Math.PI, age: 0, armed: false, nearMissed: false });
  stepFor(g, C.MINE_TELEGRAPH + 0.05);
  const mine = g.entities.find((e) => e.kind === 'mine');
  assert.ok(mine, 'mine still alive');
  assert.strictEqual(mine.armed, true);
  assert.ok(g.events.some((e) => e.type === 'mine-armed'));
});

test('armed mine on ship ring at ship angle kills; telegraphing mine does not', () => {
  let g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'mine', ring: g.ship.ring, angle: g.ship.angle, age: 5, armed: true, nearMissed: false });
  g.update(1 / 60);
  assert.strictEqual(g.state, 'over');
  assert.ok(g.events.some((e) => e.type === 'death'));

  g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'mine', ring: g.ship.ring, angle: g.ship.angle, age: 0, armed: false, nearMissed: false });
  g.update(1 / 60);
  assert.strictEqual(g.state, 'running', 'telegraphing mine must not kill');
});

test('gem collection scores 25x multiplier, then increments combo (cap 5)', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  const baseline = g.score;
  for (let i = 0; i < 7; i++) {
    g.entities.push({ kind: 'gem', ring: g.ship.ring, angle: g.ship.angle, age: 0 });
    const before = g.multiplier;
    const scoreBefore = g.score;
    g.update(1 / 60);
    const gained = g.score - scoreBefore;
    assert.ok(gained >= C.GEM_PTS * before, `gem worth at least 25x${before}`);
    assert.strictEqual(g.multiplier, Math.min(C.COMBO_MAX, before + 1));
    assert.ok(g.events.some((e) => e.type === 'gem'));
    g.events.length = 0;
  }
  assert.strictEqual(g.multiplier, C.COMBO_MAX);
  assert.ok(g.score > baseline);
});

test('combo decays one step after COMBO_DECAY seconds without gems', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'gem', ring: g.ship.ring, angle: g.ship.angle, age: 0 });
  g.update(1 / 60);
  g.entities.push({ kind: 'gem', ring: g.ship.ring, angle: g.ship.angle, age: 0 });
  g.update(1 / 60);
  assert.strictEqual(g.multiplier, 3);
  g.events.length = 0;
  // survive without gems; keep clearing spawns so nothing kills us
  for (let i = 0; i < Math.round((C.COMBO_DECAY + 0.1) * 60); i++) {
    g.update(1 / 60);
    g.entities.length = 0;
  }
  assert.strictEqual(g.multiplier, 2);
  assert.ok(g.events.some((e) => e.type === 'combo-down'));
});

test('near-miss: armed hazard on other ring within threshold scores once', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  const otherRing = g.ship.ring === 1 ? 0 : 1;
  g.entities.push({ kind: 'mine', ring: otherRing, angle: g.ship.angle + 0.1, age: 5, armed: true, nearMissed: false });
  const before = g.score;
  g.update(1 / 60);
  assert.strictEqual(g.state, 'running');
  assert.ok(g.events.some((e) => e.type === 'nearmiss'));
  assert.ok(g.score >= before + C.NEAR_MISS_PTS);
  g.events.length = 0;
  g.update(1 / 60);
  assert.ok(!g.events.some((e) => e.type === 'nearmiss'), 'near-miss only counted once per hazard');
});

test('comets move opposite to ship direction and kill on contact', () => {
  const g = RS.createGame({ rng: mkRng(3) });
  let comet = null;
  for (let i = 0; i < 3600 && !comet; i++) {
    g.update(1 / 60);
    if (g.state !== 'running') break;
    comet = g.entities.find((e) => e.kind === 'comet') || null;
    if (!comet) g.entities.length = 0; // keep board clear until a comet shows
  }
  assert.ok(comet, 'a comet eventually spawns');
  assert.ok(comet.vel * 1 < 0, 'comet angular velocity opposes ship direction (+1)');

  const g2 = RS.createGame({ rng: mkRng(1) });
  g2.entities.push({ kind: 'comet', ring: g2.ship.ring, angle: g2.ship.angle, age: 0, vel: -2, nearMissed: false });
  g2.update(1 / 60);
  assert.strictEqual(g2.state, 'over');
});

test('difficulty: omega ramps 1.2 to 2.4 clamped at 90s', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  assert.ok(Math.abs(g.omega() - C.OMEGA_START) < 1e-9);
  g.time = 45;
  const mid = g.omega();
  assert.ok(mid > C.OMEGA_START && mid < C.OMEGA_MAX);
  g.time = 200;
  assert.ok(Math.abs(g.omega() - C.OMEGA_MAX) < 1e-9);
});

test('despawn: old mines and gems are removed', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'mine', ring: 0, angle: 1, age: C.MINE_LIFE - 0.01, armed: true, nearMissed: false });
  g.entities.push({ kind: 'gem', ring: 0, angle: 2, age: C.GEM_LIFE - 0.01 });
  g.update(0.05);
  assert.ok(!g.entities.some((e) => e.kind === 'mine' && e.angle === 1));
  assert.ok(!g.entities.some((e) => e.kind === 'gem' && e.angle === 2));
});

test('deterministic: same seed + same inputs = same outcome', () => {
  function run(seed) {
    const g = RS.createGame({ rng: mkRng(seed) });
    let hopClock = 0;
    for (let i = 0; i < 30 * 60 && g.state === 'running'; i++) {
      hopClock += 1 / 60;
      if (hopClock >= 0.9) { hopClock = 0; g.hop(); }
      g.update(1 / 60);
    }
    return { score: g.score, time: g.time, state: g.state };
  }
  assert.deepStrictEqual(run(42), run(42));
});

test('after death, update is inert and score frozen', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'mine', ring: g.ship.ring, angle: g.ship.angle, age: 5, armed: true, nearMissed: false });
  g.update(1 / 60);
  assert.strictEqual(g.state, 'over');
  const frozen = g.score;
  g.update(1);
  assert.strictEqual(g.score, frozen);
});

test('score is always a non-negative integer', () => {
  const g = RS.createGame({ rng: mkRng(9) });
  for (let i = 0; i < 600 && g.state === 'running'; i++) {
    g.update(1 / 60);
    assert.ok(Number.isInteger(g.score) && g.score >= 0, `score ${g.score}`);
  }
});

test('gems counter tracks collected gems for stats', () => {
  const g = RS.createGame({ rng: mkRng(1) });
  g.entities.push({ kind: 'gem', ring: g.ship.ring, angle: g.ship.angle, age: 0 });
  g.update(1 / 60);
  assert.strictEqual(g.gems, 1);
});
