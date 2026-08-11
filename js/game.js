(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};

  // All distances are in "arena units": outer ring radius = 1.0. The renderer
  // multiplies by its pixel radius R, so simulation is resolution-independent.
  var C = {
    RING_R: [0.62, 1.0],
    SHIP_R: 0.07,
    MINE_R: 0.075,
    COMET_R: 0.07,
    GEM_R: 0.055,
    OMEGA_START: 1.2,
    OMEGA_MAX: 2.4,
    OMEGA_RAMP: 90,
    SPAWN_START: 1.4,
    SPAWN_MIN: 0.55,
    SPAWN_RAMP: 120,
    HOP_TIME: 0.12,
    MINE_TELEGRAPH: 0.8,
    MINE_LIFE: 6,
    COMET_LIFE: 12,
    GEM_LIFE: 8,
    COMBO_MAX: 5,
    COMBO_DECAY: 5,
    NEAR_MISS_ANG: 0.18,
    NEAR_MISS_PTS: 5,
    GEM_PTS: 25,
    TIME_PTS: 10,
    DOUBLE_MINE_AFTER: 30,
    DOUBLE_MINE_CHANCE: 0.2
  };

  RS.GAME_C = C;

  var HAZARD_R = { mine: C.MINE_R, comet: C.COMET_R };

  function angDist(a, b) {
    var d = Math.abs(a - b) % (Math.PI * 2);
    return d > Math.PI ? Math.PI * 2 - d : d;
  }

  RS.createGame = function (opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;

    var g = {
      state: 'running',
      time: 0,
      ship: {
        ring: 1,
        angle: 0,
        dir: 1,
        hop: { active: false, from: 1, to: 0, t: 0 }
      },
      entities: [],
      events: [],
      gems: 0,
      multiplier: 1
    };

    var gemPoints = 0;
    var nearMissPoints = 0;
    var comboTimer = 0;
    var spawnTimer = 0;

    Object.defineProperty(g, 'score', {
      get: function () {
        return Math.floor(g.time * C.TIME_PTS) + gemPoints + nearMissPoints;
      }
    });

    g.omega = function () {
      var k = Math.min(g.time / C.OMEGA_RAMP, 1);
      return C.OMEGA_START + (C.OMEGA_MAX - C.OMEGA_START) * k;
    };

    g.effectiveRing = function () {
      var hop = g.ship.hop;
      if (!hop.active) return g.ship.ring;
      return hop.t < 0.5 ? hop.from : hop.to;
    };

    g.hop = function () {
      if (g.state !== 'running') return;
      var hop = g.ship.hop;
      if (hop.active) return;
      hop.active = true;
      hop.from = g.ship.ring;
      hop.to = g.ship.ring === 1 ? 0 : 1;
      hop.t = 0;
      g.events.push({ type: 'hop', to: hop.to });
    };

    function spawnInterval() {
      var k = Math.min(g.time / C.SPAWN_RAMP, 1);
      return C.SPAWN_START - (C.SPAWN_START - C.SPAWN_MIN) * k;
    }

    function spawnAngle() {
      return g.ship.angle + g.ship.dir * (1.2 + rng() * 1.35);
    }

    function spawnOne() {
      var roll = rng();
      var ring = rng() < 0.5 ? 0 : 1;
      var angle = spawnAngle();
      if (roll < 0.45) {
        g.entities.push({ kind: 'gem', ring: ring, angle: angle, age: 0 });
      } else if (roll < 0.85) {
        var both = g.time > C.DOUBLE_MINE_AFTER && rng() < C.DOUBLE_MINE_CHANCE;
        g.entities.push({ kind: 'mine', ring: ring, angle: angle, age: 0, armed: false, nearMissed: false });
        if (both) {
          g.entities.push({ kind: 'mine', ring: ring === 1 ? 0 : 1, angle: angle, age: 0, armed: false, nearMissed: false });
        }
      } else {
        g.entities.push({
          kind: 'comet',
          ring: ring,
          angle: angle,
          age: 0,
          vel: -g.ship.dir * (1.3 + rng() * 0.5) * g.omega(),
          nearMissed: false
        });
      }
    }

    function die() {
      g.state = 'over';
      g.events.push({ type: 'death' });
    }

    g.update = function (dt) {
      if (g.state !== 'running') return;

      g.time += dt;

      // Ship motion + hop progress
      g.ship.angle += g.ship.dir * g.omega() * dt;
      var hop = g.ship.hop;
      if (hop.active) {
        hop.t += dt / C.HOP_TIME;
        if (hop.t >= 1) {
          hop.active = false;
          hop.t = 1;
          g.ship.ring = hop.to;
        }
      }

      // Entity aging, motion, despawn
      for (var i = g.entities.length - 1; i >= 0; i--) {
        var e = g.entities[i];
        e.age += dt;
        if (e.kind === 'mine') {
          if (!e.armed && e.age >= C.MINE_TELEGRAPH) {
            e.armed = true;
            g.events.push({ type: 'mine-armed' });
          }
          if (e.age >= C.MINE_LIFE) { g.entities.splice(i, 1); continue; }
        } else if (e.kind === 'comet') {
          e.angle += e.vel * dt;
          if (e.age >= C.COMET_LIFE) { g.entities.splice(i, 1); continue; }
        } else if (e.kind === 'gem') {
          if (e.age >= C.GEM_LIFE) { g.entities.splice(i, 1); continue; }
        }
      }

      // Collisions, pickups, near-misses
      var ringIdx = g.effectiveRing();
      var collectedGem = false;

      for (var j = g.entities.length - 1; j >= 0; j--) {
        var ent = g.entities[j];
        var arc = angDist(g.ship.angle, ent.angle) * C.RING_R[ent.ring];

        if (ent.kind === 'gem') {
          if (ent.ring === ringIdx && arc < C.SHIP_R + C.GEM_R) {
            g.entities.splice(j, 1);
            g.gems += 1;
            gemPoints += C.GEM_PTS * g.multiplier;
            g.events.push({ type: 'gem', combo: g.multiplier });
            if (g.multiplier < C.COMBO_MAX) {
              g.multiplier += 1;
              g.events.push({ type: 'combo-up', multiplier: g.multiplier });
            }
            comboTimer = 0;
            collectedGem = true;
          }
          continue;
        }

        // Hazards: mines only count when armed, comets always
        var dangerous = ent.kind === 'comet' || ent.armed;
        if (!dangerous) continue;

        if (ent.ring === ringIdx) {
          if (arc < (C.SHIP_R + HAZARD_R[ent.kind])) {
            die();
            return;
          }
        } else if (!ent.nearMissed && angDist(g.ship.angle, ent.angle) < C.NEAR_MISS_ANG) {
          ent.nearMissed = true;
          nearMissPoints += C.NEAR_MISS_PTS;
          g.events.push({ type: 'nearmiss' });
        }
      }

      // Combo decay
      if (!collectedGem && g.multiplier > 1) {
        comboTimer += dt;
        if (comboTimer >= C.COMBO_DECAY) {
          comboTimer = 0;
          g.multiplier -= 1;
          g.events.push({ type: 'combo-down', multiplier: g.multiplier });
        }
      }

      // Spawning (after ship motion so fresh spawns are always ahead of the
      // ship's final position this frame — never inside the collision zone)
      spawnTimer += dt;
      var interval = spawnInterval();
      while (spawnTimer >= interval) {
        spawnTimer -= interval;
        spawnOne();
      }
    };

    return g;
  };
})(typeof window !== 'undefined' ? window : globalThis);
