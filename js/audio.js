(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};

  // Everything is synthesized at runtime: no audio files, no licensing risk.
  // Graph: source -> envelope -> (musicGain|sfxGain) -> enabledGain -> out.
  // enabledGain is the YouTube-level gate (isAudioEnabled); the in-game
  // Music/SFX sliders only touch musicGain/sfxGain beneath it.

  var ctx = null;
  var enabledGain = null;
  var musicGain = null;
  var sfxGain = null;
  var enabled = true;
  var musicVol = 0.8;
  var sfxVol = 1.0;
  var noiseBuffer = null;
  var musicTimer = null;
  var musicNodes = [];
  var nextNoteTime = 0;
  var beat = 0;
  var arpIndex = 2;

  var BPM = 84;
  var SECONDS_PER_BEAT = 60 / BPM;
  // Am - F - C - G roots, 4 beats each
  var CHORD_ROOTS = [110.0, 87.31, 130.81, 98.0];
  var PENTA = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]; // A3 C4 D4 E4 G4 A4

  function applyGains() {
    if (!ctx) return;
    var now = ctx.currentTime;
    enabledGain.gain.setTargetAtTime(enabled ? 1 : 0, now, 0.01);
    musicGain.gain.setTargetAtTime(musicVol * 0.5, now, 0.02);
    sfxGain.gain.setTargetAtTime(sfxVol, now, 0.02);
  }

  function makeNoiseBuffer() {
    var len = ctx.sampleRate;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(target, t0, attack, peak, decay) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    g.connect(target);
    return g;
  }

  function osc(type, freq, t0) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    return o;
  }

  var SFX = {
    hop: function (t0) {
      var o = osc('square', 300, t0);
      o.frequency.exponentialRampToValueAtTime(520, t0 + 0.06);
      o.connect(env(sfxGain, t0, 0.005, 0.22, 0.065));
      o.start(t0); o.stop(t0 + 0.09);
    },
    gem: function (t0, opts) {
      var combo = Math.min((opts && opts.combo) || 1, 5);
      var f = 660 * (1 + 0.12 * combo);
      var o1 = osc('sine', f, t0);
      o1.connect(env(sfxGain, t0, 0.006, 0.3, 0.13));
      o1.start(t0); o1.stop(t0 + 0.16);
      var o2 = osc('sine', f * 1.19, t0); // minor third overtone
      o2.connect(env(sfxGain, t0, 0.006, 0.12, 0.11));
      o2.start(t0); o2.stop(t0 + 0.14);
    },
    nearmiss: function (t0) {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800, t0);
      bp.Q.value = 4;
      src.connect(bp);
      bp.connect(env(sfxGain, t0, 0.04, 0.18, 0.09));
      src.start(t0); src.stop(t0 + 0.14);
    },
    death: function (t0) {
      var o = osc('sawtooth', 220, t0);
      o.frequency.exponentialRampToValueAtTime(38, t0 + 0.5);
      o.connect(env(sfxGain, t0, 0.005, 0.35, 0.5));
      o.start(t0); o.stop(t0 + 0.55);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1200, t0);
      lp.frequency.exponentialRampToValueAtTime(120, t0 + 0.2);
      src.connect(lp);
      lp.connect(env(sfxGain, t0, 0.002, 0.3, 0.2));
      src.start(t0); src.stop(t0 + 0.25);
    },
    ui: function (t0) {
      var o = osc('triangle', 1200, t0);
      o.connect(env(sfxGain, t0, 0.003, 0.15, 0.035));
      o.start(t0); o.stop(t0 + 0.05);
    },
    fanfare: function (t0) {
      var notes = [440, 554.37, 659.25]; // A4 C#5 E5
      for (var i = 0; i < notes.length; i++) {
        var o = osc('sine', notes[i], t0 + i * 0.09);
        o.connect(env(sfxGain, t0 + i * 0.09, 0.008, 0.25, 0.2));
        o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.24);
      }
    }
  };

  function scheduleMusic() {
    if (!ctx) return;
    var ahead = ctx.currentTime + 0.3;
    while (nextNoteTime < ahead) {
      var t0 = nextNoteTime;
      var chord = CHORD_ROOTS[Math.floor(beat / 4) % CHORD_ROOTS.length];

      // Pad: two detuned triangles at the chord root on beat 1 of each bar
      if (beat % 4 === 0) {
        for (var d = -1; d <= 1; d += 2) {
          var pad = ctx.createOscillator();
          pad.type = 'triangle';
          pad.frequency.setValueAtTime(chord * Math.pow(2, d * 6 / 1200), t0);
          var lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 900;
          pad.connect(lp);
          var padDur = SECONDS_PER_BEAT * 4;
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.4);
          g.gain.setValueAtTime(0.1, t0 + padDur - 0.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + padDur);
          lp.connect(g);
          g.connect(musicGain);
          pad.start(t0); pad.stop(t0 + padDur + 0.05);
          musicNodes.push(pad);
        }
      }

      // Arp: one pentatonic note per half-beat, gentle random walk
      for (var h = 0; h < 2; h++) {
        var ta = t0 + h * SECONDS_PER_BEAT / 2;
        arpIndex += Math.random() < 0.5 ? -1 : 1;
        if (arpIndex < 0) arpIndex = 1;
        if (arpIndex >= PENTA.length) arpIndex = PENTA.length - 2;
        var note = osc('sine', PENTA[arpIndex], ta);
        note.connect(env(musicGain, ta, 0.01, 0.07, 0.17));
        note.start(ta); note.stop(ta + 0.2);
        musicNodes.push(note);
      }

      // Trim the bookkeeping list so it does not grow unbounded.
      if (musicNodes.length > 64) musicNodes.splice(0, musicNodes.length - 64);

      nextNoteTime += SECONDS_PER_BEAT;
      beat++;
    }
  }

  RS.audio = {
    get ready() { return !!ctx; },

    // Must be called from a user-gesture handler (autoplay policy).
    init: function () {
      if (ctx) {
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        return;
      }
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch (e) { ctx = null; return; }
      enabledGain = ctx.createGain();
      enabledGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.connect(enabledGain);
      sfxGain = ctx.createGain();
      sfxGain.connect(enabledGain);
      noiseBuffer = makeNoiseBuffer();
      applyGains();
    },

    setEnabled: function (on) {
      enabled = !!on;
      applyGains();
    },

    setMusicVolume: function (v) {
      musicVol = Math.min(Math.max(Number(v) || 0, 0), 1);
      applyGains();
    },

    setSfxVolume: function (v) {
      sfxVol = Math.min(Math.max(Number(v) || 0, 0), 1);
      applyGains();
    },

    suspend: function () {
      this.stopMusic();
      if (ctx && ctx.state === 'running') {
        try { ctx.suspend(); } catch (e) {}
      }
    },

    resume: function () {
      if (ctx && ctx.state === 'suspended') {
        try { ctx.resume(); } catch (e) {}
      }
    },

    sfx: function (name, opts) {
      if (!ctx || !enabled || ctx.state !== 'running') return;
      var recipe = SFX[name];
      if (!recipe) return;
      try { recipe(ctx.currentTime, opts); } catch (e) {}
    },

    startMusic: function () {
      if (!ctx || musicTimer) return;
      nextNoteTime = ctx.currentTime + 0.05;
      scheduleMusic();
      musicTimer = setInterval(scheduleMusic, 100);
    },

    stopMusic: function () {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
      for (var i = 0; i < musicNodes.length; i++) {
        try { musicNodes[i].stop(); } catch (e) {}
      }
      musicNodes.length = 0;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
