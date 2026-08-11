(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};

  // ---------------------------------------------------------------------------
  // Save codec: versioned, tolerant of garbage/legacy/foreign fields.
  // ---------------------------------------------------------------------------

  var DEFAULTS = {
    v: 1,
    best: 0,
    music: 0.8,
    sfx: 1.0,
    gamesPlayed: 0,
    totalGems: 0,
    tutorialSeen: false
  };

  function cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function coerceCount(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return fallback;
    return Math.floor(n);
  }

  function coerceVolume(value, fallback) {
    var n = Number(value);
    if (typeof value === 'boolean' || value === null || value === '' ||
        !isFinite(n) || n < 0 || n > 1) return fallback;
    return n;
  }

  RS.saveCodec = {
    DEFAULTS: DEFAULTS,

    parse: function (str) {
      var raw = null;
      if (typeof str === 'string' && str.length) {
        try { raw = JSON.parse(str); } catch (e) { raw = null; }
      }
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
      var out = cloneDefaults();
      for (var key in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
      }
      out.v = coerceCount(raw.v, DEFAULTS.v) || DEFAULTS.v;
      out.best = coerceCount(raw.best, DEFAULTS.best);
      out.gamesPlayed = coerceCount(raw.gamesPlayed, DEFAULTS.gamesPlayed);
      out.totalGems = coerceCount(raw.totalGems, DEFAULTS.totalGems);
      out.music = coerceVolume(raw.music, DEFAULTS.music);
      out.sfx = coerceVolume(raw.sfx, DEFAULTS.sfx);
      out.tutorialSeen = !!raw.tutorialSeen;
      return out;
    },

    serialize: function (obj) {
      return JSON.stringify(obj);
    }
  };

  // ---------------------------------------------------------------------------
  // ytgame wrapper. Every touch of the ytgame global is lazy and guarded:
  // caught SdkError may be `undefined`, so catch blocks never inspect it.
  // ---------------------------------------------------------------------------

  var LOCAL_KEY = 'ringshift-save';
  var state = { loaded: false, firstFrameSent: false, gameReadySent: false };

  function yt() {
    try { return root.ytgame || null; } catch (e) { return null; }
  }

  function inEnv() {
    try {
      var y = yt();
      return !!(y && y.IN_PLAYABLES_ENV);
    } catch (e) { return false; }
  }

  function logErrorSafe() {
    try {
      var y = yt();
      if (y && y.health) y.health.logError();
    } catch (e) { /* best effort */ }
  }

  function localGet() {
    try {
      if (root.localStorage) return root.localStorage.getItem(LOCAL_KEY);
    } catch (e) { /* storage may be unavailable */ }
    return null;
  }

  function localSet(str) {
    try {
      if (root.localStorage) root.localStorage.setItem(LOCAL_KEY, str);
    } catch (e) { /* storage may be unavailable */ }
  }

  RS.sdk = {
    get inEnv() { return inEnv(); },

    _reset: function () {
      state.loaded = false;
      state.firstFrameSent = false;
      state.gameReadySent = false;
    },

    init: function () {
      if (!inEnv()) {
        state.loaded = true;
        return Promise.resolve({ save: RS.saveCodec.parse(localGet()), lang: 'en' });
      }
      var loadP, langP;
      try { loadP = yt().game.loadData(); } catch (e) { loadP = Promise.reject(); }
      try { langP = yt().system.getLanguage(); } catch (e) { langP = Promise.reject(); }
      return Promise.allSettled([loadP, langP]).then(function (results) {
        state.loaded = true;
        var save = RS.saveCodec.parse(
          results[0].status === 'fulfilled' ? results[0].value : undefined
        );
        var lang = (results[1].status === 'fulfilled' && typeof results[1].value === 'string')
          ? results[1].value : 'en';
        return { save: save, lang: lang };
      });
    },

    firstFrameReady: function () {
      if (state.firstFrameSent) return;
      state.firstFrameSent = true;
      try {
        var y = yt();
        if (y && y.game) y.game.firstFrameReady();
      } catch (e) { /* non-fatal */ }
    },

    gameReady: function () {
      if (state.gameReadySent) return;
      this.firstFrameReady();
      state.gameReadySent = true;
      try {
        var y = yt();
        if (y && y.game) y.game.gameReady();
      } catch (e) { /* non-fatal */ }
    },

    // Persists the session save object. Drops silently until init() has
    // settled loadData — saveData before loadData is rejected by YouTube.
    save: function (obj) {
      if (!state.loaded) return Promise.resolve();
      var str;
      try { str = RS.saveCodec.serialize(obj); } catch (e) { return Promise.resolve(); }
      if (!inEnv()) {
        localSet(str);
        return Promise.resolve();
      }
      try {
        return Promise.resolve(yt().game.saveData(str)).catch(function () {
          logErrorSafe();
        });
      } catch (e) {
        logErrorSafe();
        return Promise.resolve();
      }
    },

    sendScore: function (n) {
      var value = Math.floor(Number(n));
      if (!isFinite(value) || value < 0) value = 0;
      if (!inEnv()) return Promise.resolve();
      try {
        return Promise.resolve(yt().engagement.sendScore({ value: value })).catch(function () {
          logErrorSafe();
        });
      } catch (e) {
        logErrorSafe();
        return Promise.resolve();
      }
    },

    isAudioEnabled: function () {
      if (!inEnv()) return true;
      try { return !!yt().system.isAudioEnabled(); } catch (e) { return true; }
    },

    onAudioEnabledChange: function (cb) {
      try {
        var y = yt();
        if (y && y.system) return y.system.onAudioEnabledChange(cb) || function () {};
      } catch (e) { /* non-fatal */ }
      return function () {};
    },

    onPause: function (cb) {
      try {
        var y = yt();
        if (y && y.system) return y.system.onPause(cb) || function () {};
      } catch (e) { /* non-fatal */ }
      return function () {};
    },

    onResume: function (cb) {
      try {
        var y = yt();
        if (y && y.system) return y.system.onResume(cb) || function () {};
      } catch (e) { /* non-fatal */ }
      return function () {};
    },

    logError: logErrorSafe
  };
})(typeof window !== 'undefined' ? window : globalThis);
