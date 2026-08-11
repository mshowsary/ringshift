(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};
  var doc = root.document;
  if (!doc) return; // browser-only module

  var STATE = { SPLASH: 'splash', MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

  var appState = STATE.SPLASH;
  var game = null;
  var renderer = null;
  var save = null;
  var last = 0;
  var elapsed = 0;
  var shake = 0;
  var slowmo = 0; // seconds of slow motion remaining
  var deathHandled = false;
  var hintVisible = false;
  var reducedMotion = false;
  var sdkPaused = false;
  var rafRunning = false;

  try {
    var mq = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = !!(mq && mq.matches);
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function (ev) { reducedMotion = ev.matches; });
    }
  } catch (e) { /* media queries unavailable */ }

  function persist() {
    RS.sdk.save(save);
  }

  function startGame() {
    game = RS.createGame({});
    deathHandled = false;
    slowmo = 0;
    shake = 0;
    renderer.clearFx();
    RS.ui.resetHud();
    RS.ui.showPlay();
    appState = STATE.PLAYING;
    last = 0;
    RS.audio.init();
    RS.audio.resume();
    RS.audio.startMusic();
    if (!save.tutorialSeen) {
      hintVisible = true;
      RS.ui.setHint(true);
    }
  }

  function pauseGame() {
    if (appState !== STATE.PLAYING) return;
    appState = STATE.PAUSED;
    RS.audio.suspend();
    RS.ui.openOverlay('pause');
    persist();
  }

  function resumeFromOverlay() {
    if (appState !== STATE.PAUSED) return;
    RS.ui.closeOverlay('pause');
    if (RS.ui.topOverlay() === 'settings') RS.ui.closeOverlay('settings');
    appState = STATE.PLAYING;
    last = 0; // avoid a huge dt jump on the next frame
    RS.audio.init();
    RS.audio.resume();
    RS.audio.startMusic();
  }

  function endGame() {
    appState = STATE.GAMEOVER;
    RS.audio.stopMusic();
    var score = game.score;
    save.gamesPlayed += 1;
    save.totalGems += game.gems;
    var isNew = score > save.best;
    if (isNew) {
      save.best = score;
      RS.audio.sfx('fanfare');
    }
    persist();
    // Saved best is updated first, so the score YouTube keeps as the user's
    // highest always matches the best stored in the game save.
    RS.sdk.sendScore(score);
    RS.ui.setHint(false);
    RS.ui.showGameOver({ score: score, best: save.best, isNew: isNew });
  }

  function toMenu() {
    appState = STATE.MENU;
    game = null;
    RS.audio.stopMusic();
    RS.ui.closeOverlay('pause');
    RS.ui.closeOverlay('settings');
    RS.ui.setHint(false);
    RS.ui.updateMenuBest(save.best);
    RS.ui.show('menu');
  }

  function onHopInput() {
    RS.audio.init();
    if (appState !== STATE.PLAYING || !game) return;
    if (hintVisible) {
      hintVisible = false;
      RS.ui.setHint(false);
      save.tutorialSeen = true;
      persist();
    }
    game.hop();
  }

  function isUiTarget(target) {
    if (!target || !target.closest) return false;
    return !!target.closest('button, input, .overlay, #screen-menu, #screen-gameover');
  }

  function frame(ts) {
    // SDK pause halts ALL execution including rendering (certification
    // requirement); the loop restarts from the onResume callback.
    if (sdkPaused) {
      rafRunning = false;
      return;
    }
    root.requestAnimationFrame(frame);
    frameCount++;
    if (!last) { last = ts; return; }
    var dt = Math.min((ts - last) / 1000, 0.05);
    last = ts;
    elapsed += dt;

    var simDt = dt;
    if (slowmo > 0) {
      slowmo -= dt;
      simDt = dt * 0.25;
    }

    if (appState === STATE.PLAYING && game) {
      game.update(simDt);
      var events = game.events.splice(0);
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (ev.type === 'hop') {
          RS.audio.sfx('hop');
        } else if (ev.type === 'gem') {
          RS.audio.sfx('gem', { combo: ev.combo });
          var gp = renderer.shipPos(game);
          renderer.spawnBurst(gp.x, gp.y, '#ffd54d', reducedMotion ? 6 : 14);
        } else if (ev.type === 'nearmiss') {
          RS.audio.sfx('nearmiss');
          var np = renderer.shipPos(game);
          renderer.spawnBurst(np.x, np.y, '#4de3ff', reducedMotion ? 4 : 8, 0.7);
          shake = Math.max(shake, 0.15);
        } else if (ev.type === 'death') {
          RS.audio.sfx('death');
          var dp = renderer.shipPos(game);
          renderer.spawnBurst(dp.x, dp.y, '#4de3ff', reducedMotion ? 15 : 40, 1.6);
          renderer.spawnBurst(dp.x, dp.y, '#ff4da6', reducedMotion ? 8 : 20, 1.2);
          shake = 1;
          slowmo = 0.6;
          deathHandled = false;
        }
      }
      if (game.state === 'over' && !deathHandled) {
        deathHandled = true;
        setTimeout(endGame, 650);
      }
      RS.ui.updateHud(game);
    }

    shake *= 0.9;

    var showGame = game !== null;
    renderer.draw(showGame ? game : null, {
      t: elapsed,
      dt: dt,
      shake: shake,
      reducedMotion: reducedMotion,
      showShip: !(game && game.state === 'over')
    });
  }

  function startLoop() {
    if (rafRunning) return;
    rafRunning = true;
    last = 0;
    root.requestAnimationFrame(frame);
  }

  var frameCount = 0;

  // Read-only hooks for the automated verification harness (tools/verify.js).
  RS.debug = {
    game: function () { return game; },
    state: function () { return appState; },
    frames: function () { return frameCount; },
    save: function () { return save; }
  };

  function wireInput() {
    doc.addEventListener('pointerdown', function (ev) {
      if (isUiTarget(ev.target)) return;
      onHopInput();
    });

    doc.addEventListener('keydown', function (ev) {
      var key = ev.key;
      if (key === 'Escape') {
        // Never preventDefault on Escape (certification requirement).
        var top = RS.ui.topOverlay();
        if (top === 'settings') {
          RS.audio.sfx('ui');
          RS.ui.closeOverlay('settings');
          persist();
        } else if (appState === STATE.PAUSED) {
          resumeFromOverlay();
        }
        return;
      }
      if (key === ' ' || key === 'ArrowUp' || key === 'Enter') {
        var active = doc.activeElement;
        if (active && (active.tagName === 'BUTTON' || active.tagName === 'INPUT')) {
          return; // let native button/slider activation work
        }
        if (appState === STATE.PLAYING) {
          if (key === ' ') ev.preventDefault(); // stop page scroll only
          onHopInput();
        }
      }
    });

    root.addEventListener('resize', function () {
      renderer.resize();
    });
  }

  function wireSdk() {
    RS.sdk.onPause(function () {
      // YouTube pause or imminent eviction: freeze everything including the
      // render loop, and flush the save within the short eviction window.
      sdkPaused = true;
      if (appState === STATE.PLAYING) {
        pauseGame();
      } else {
        RS.audio.suspend();
        persist();
      }
    });

    RS.sdk.onResume(function () {
      // Rendering may restart; gameplay stays on the Paused overlay until
      // the player explicitly taps Resume.
      sdkPaused = false;
      startLoop();
      if (appState !== STATE.PAUSED) RS.audio.resume();
    });

    RS.audio.setEnabled(RS.sdk.isAudioEnabled());
    RS.sdk.onAudioEnabledChange(function (on) {
      RS.audio.setEnabled(on);
    });
  }

  function wireUi() {
    RS.ui.bindOnce({
      onPlay: function () {
        RS.audio.init();
        RS.audio.sfx('ui');
        startGame();
      },
      onPause: function () {
        RS.audio.sfx('ui');
        pauseGame();
      },
      onResume: function () {
        RS.audio.sfx('ui');
        resumeFromOverlay();
      },
      onMenu: function () {
        RS.audio.sfx('ui');
        toMenu();
      },
      onSettingsOpen: function () {
        RS.audio.init();
        RS.audio.sfx('ui');
        RS.ui.openOverlay('settings');
      },
      onSettingsClose: function () {
        RS.audio.sfx('ui');
        RS.ui.closeOverlay('settings');
        persist();
      },
      onMusic: function (v) {
        RS.audio.init();
        save.music = v;
        RS.audio.setMusicVolume(v);
      },
      onSfx: function (v) {
        RS.audio.init();
        save.sfx = v;
        RS.audio.setSfxVolume(v);
        RS.audio.sfx('ui');
      }
    });
  }

  function boot() {
    // Splash is rendering: tell YouTube the first frame is visible.
    root.requestAnimationFrame(function () {
      RS.sdk.firstFrameReady();
    });

    root.addEventListener('error', function () { RS.sdk.logError(); });
    root.addEventListener('unhandledrejection', function () { RS.sdk.logError(); });

    renderer = RS.createRenderer(doc.getElementById('game-canvas'));

    RS.sdk.init().then(function (result) {
      save = result.save;
      RS.i18n.setLocale(result.lang);
      RS.i18n.apply(doc);
      doc.documentElement.lang = RS.i18n.locale;

      RS.audio.setMusicVolume(save.music);
      RS.audio.setSfxVolume(save.sfx);
      RS.ui.setSliders(save.music, save.sfx);

      wireInput();
      wireSdk();
      wireUi();

      RS.ui.updateMenuBest(save.best);
      RS.ui.show('menu');
      appState = STATE.MENU;

      startLoop();

      // Menu is interactive now — and only now.
      RS.sdk.gameReady();
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
