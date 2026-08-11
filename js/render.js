(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};

  var TAU = Math.PI * 2;
  var COLORS = {
    bg: '#0b0e1a',
    ring: 'rgba(77, 227, 255, 0.25)',
    ringArc: 'rgba(77, 227, 255, 0.8)',
    core: '#4de3ff',
    ship: '#4de3ff',
    mine: '#ff5a5a',
    mineWarn: '#ffd54d',
    comet: '#ff4da6',
    gem: '#ffd54d'
  };
  var MAX_PARTICLES = 400;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  RS.createRenderer = function (canvas) {
    var ctx = canvas.getContext('2d');
    var stars = [];
    var particles = [];
    var trail = [];
    var vw = 0, vh = 0;

    var r = {
      arena: { cx: 0, cy: 0, R: 100 }
    };

    r.resize = function () {
      var dpr = Math.min(root.devicePixelRatio || 1, 2);
      vw = canvas.clientWidth || root.innerWidth;
      vh = canvas.clientHeight || root.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      r.arena.cx = vw / 2;
      r.arena.cy = vh / 2;
      r.arena.R = Math.min(vw, vh) * 0.36;
      // Refill the starfield to cover the (possibly larger) viewport.
      var count = Math.ceil(vw * vh / 9000);
      stars.length = 0;
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * vw,
          y: Math.random() * vh,
          r: 0.5 + Math.random() * 1.3,
          phase: Math.random() * TAU
        });
      }
    };

    function pos(ring01, angle) {
      var rad = r.arena.R * ring01;
      return {
        x: r.arena.cx + Math.cos(angle) * rad,
        y: r.arena.cy + Math.sin(angle) * rad
      };
    }

    r.spawnBurst = function (x, y, color, n, speed) {
      speed = speed || 1;
      for (var i = 0; i < n; i++) {
        if (particles.length >= MAX_PARTICLES) particles.shift();
        var a = Math.random() * TAU;
        var v = (30 + Math.random() * 140) * speed;
        particles.push({
          x: x, y: y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 1,
          decay: 1.2 + Math.random() * 1.6,
          size: 1.5 + Math.random() * 2.5,
          color: color
        });
      }
    };

    function drawStars(t, reducedMotion) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var alpha = reducedMotion ? 0.5 : 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + s.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#cdd6f4';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawRings(t) {
      var R = r.arena.R;
      ctx.lineWidth = 3;
      for (var k = 0; k < 2; k++) {
        var rad = R * RS.GAME_C.RING_R[k];
        ctx.strokeStyle = COLORS.ring;
        ctx.beginPath();
        ctx.arc(r.arena.cx, r.arena.cy, rad, 0, TAU);
        ctx.stroke();
        // Rotating bright arc segments for depth
        ctx.strokeStyle = COLORS.ringArc;
        ctx.globalAlpha = 0.35;
        var offset = t * (k === 0 ? 0.3 : -0.22);
        for (var seg = 0; seg < 3; seg++) {
          var a0 = offset + seg * (TAU / 3);
          ctx.beginPath();
          ctx.arc(r.arena.cx, r.arena.cy, rad, a0, a0 + 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    function drawCore(t, reducedMotion) {
      var R = r.arena.R;
      var pulse = reducedMotion ? 1 : 1 + 0.04 * Math.sin(t * 2.4);
      var radius = R * 0.18 * pulse;
      var grad = ctx.createRadialGradient(
        r.arena.cx, r.arena.cy, radius * 0.1,
        r.arena.cx, r.arena.cy, radius * 1.9
      );
      grad.addColorStop(0, 'rgba(77, 227, 255, 0.9)');
      grad.addColorStop(0.45, 'rgba(77, 227, 255, 0.25)');
      grad.addColorStop(1, 'rgba(77, 227, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(r.arena.cx, r.arena.cy, radius * 1.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLORS.core;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(r.arena.cx, r.arena.cy, radius * 0.55, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function shipRadius01(ship) {
      var C = RS.GAME_C;
      if (!ship.hop.active) return C.RING_R[ship.ring];
      var from = C.RING_R[ship.hop.from];
      var to = C.RING_R[ship.hop.to];
      return lerp(from, to, easeOutCubic(Math.min(ship.hop.t, 1)));
    }

    function drawTrail() {
      for (var i = 0; i < trail.length; i++) {
        var p = trail[i];
        var k = (i + 1) / trail.length;
        ctx.globalAlpha = 0.28 * k;
        ctx.fillStyle = COLORS.ship;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * k, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawShip(g) {
      var C = RS.GAME_C;
      var rad01 = shipRadius01(g.ship);
      var p = pos(rad01, g.ship.angle);

      trail.push({ x: p.x, y: p.y });
      if (trail.length > 14) trail.shift();
      drawTrail();

      var size = r.arena.R * C.SHIP_R * 1.9;
      // Tangential heading: perpendicular to the radius, in travel direction.
      var heading = g.ship.angle + g.ship.dir * Math.PI / 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(heading);
      ctx.shadowColor = COLORS.ship;
      ctx.shadowBlur = 18;
      ctx.fillStyle = COLORS.ship;
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, size * 0.62);
      ctx.lineTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.7, -size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawMine(e, t) {
      var C = RS.GAME_C;
      var p = pos(C.RING_R[e.ring], e.angle);
      var size = r.arena.R * C.MINE_R;
      if (!e.armed) {
        // Telegraph: shrinking dashed warning ring
        var k = 1 - e.age / C.MINE_TELEGRAPH;
        ctx.save();
        ctx.strokeStyle = COLORS.mineWarn;
        ctx.globalAlpha = 0.35 + 0.55 * (1 - k);
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * (1 + 2.2 * k), 0, TAU);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 0.5;
      }
      // Spiky 8-point star
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(e.age * 0.8);
      if (e.armed) {
        ctx.shadowColor = COLORS.mine;
        ctx.shadowBlur = 14;
      }
      var fade = e.armed ? Math.min(1, (C.MINE_LIFE - e.age) / 0.5) : 1;
      ctx.globalAlpha = ctx.globalAlpha * fade;
      ctx.fillStyle = e.armed ? COLORS.mine : 'rgba(255, 90, 90, 0.55)';
      ctx.beginPath();
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * TAU;
        var rr = i % 2 === 0 ? size * 1.35 : size * 0.55;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawComet(e) {
      var C = RS.GAME_C;
      var p = pos(C.RING_R[e.ring], e.angle);
      var size = r.arena.R * C.COMET_R;
      // Tail: fading circles trailing along the ring, behind travel direction
      var back = e.vel > 0 ? -1 : 1;
      for (var i = 1; i <= 10; i++) {
        var ta = e.angle + back * i * 0.045;
        var tp = pos(C.RING_R[e.ring], ta);
        ctx.globalAlpha = 0.25 * (1 - i / 11);
        ctx.fillStyle = COLORS.comet;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, size * (1 - i / 14), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = COLORS.comet;
      ctx.shadowBlur = 16;
      ctx.fillStyle = COLORS.comet;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    function drawGem(e, t, reducedMotion) {
      var C = RS.GAME_C;
      var p = pos(C.RING_R[e.ring], e.angle);
      var size = r.arena.R * C.GEM_R * 1.4;
      var bob = reducedMotion ? 1 : 1 + 0.12 * Math.sin(t * 3 + e.angle * 5);
      var fade = Math.min(1, (C.GEM_LIFE - e.age) / 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.scale(bob, bob);
      ctx.globalAlpha = fade;
      ctx.shadowColor = COLORS.gem;
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS.gem;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function drawParticles(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.life -= p.decay * dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        ctx.globalAlpha = Math.max(p.life, 0) * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    r.clearFx = function () {
      particles.length = 0;
      trail.length = 0;
    };

    r.entityPos = function (e) {
      return pos(RS.GAME_C.RING_R[e.ring], e.angle);
    };

    r.shipPos = function (g) {
      return pos(shipRadius01(g.ship), g.ship.angle);
    };

    // g may be null (menu idle); fx = {t, dt, shake, reducedMotion, showShip}
    r.draw = function (g, fx) {
      var t = fx.t || 0;
      ctx.save();
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, vw, vh);

      if (fx.shake > 0.01 && !fx.reducedMotion) {
        ctx.translate(
          (Math.random() * 2 - 1) * 6 * fx.shake,
          (Math.random() * 2 - 1) * 6 * fx.shake
        );
      }

      drawStars(t, fx.reducedMotion);
      drawRings(t);
      drawCore(t, fx.reducedMotion);

      if (g) {
        for (var i = 0; i < g.entities.length; i++) {
          var e = g.entities[i];
          if (e.kind === 'mine') drawMine(e, t);
          else if (e.kind === 'comet') drawComet(e);
          else drawGem(e, t, fx.reducedMotion);
        }
        if (fx.showShip !== false) drawShip(g);
      }

      drawParticles(fx.dt || 0.016);
      ctx.restore();
    };

    r.resize();
    return r;
  };
})(typeof window !== 'undefined' ? window : globalThis);
