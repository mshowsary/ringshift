(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};
  var doc = root.document;
  if (!doc) return; // browser-only module

  function el(id) { return doc.getElementById(id); }

  var screens = { splash: 'splash', menu: 'screen-menu', gameover: 'screen-gameover' };
  var overlays = { pause: 'overlay-pause', settings: 'overlay-settings' };
  var primaryButton = { menu: 'btn-play', gameover: 'btn-again', pause: 'btn-resume', settings: 'btn-close-settings' };
  var overlayStack = [];
  var lastScore = null;

  RS.ui = {
    show: function (name) {
      for (var key in screens) {
        el(screens[key]).classList.toggle('hidden', key !== name);
      }
      el('hud').classList.toggle('hidden', name !== null && name !== 'play');
      var btn = primaryButton[name];
      if (btn) {
        try { el(btn).focus({ preventScroll: true }); } catch (e) {}
      }
    },

    showPlay: function () {
      for (var key in screens) el(screens[key]).classList.add('hidden');
      el('hud').classList.remove('hidden');
    },

    openOverlay: function (name) {
      if (overlayStack.indexOf(name) !== -1) return;
      overlayStack.push(name);
      el(overlays[name]).classList.remove('hidden');
      var btn = primaryButton[name];
      if (btn) {
        try { el(btn).focus({ preventScroll: true }); } catch (e) {}
      }
    },

    closeOverlay: function (name) {
      var target = name || overlayStack[overlayStack.length - 1];
      if (!target) return;
      var idx = overlayStack.indexOf(target);
      if (idx !== -1) overlayStack.splice(idx, 1);
      el(overlays[target]).classList.add('hidden');
    },

    topOverlay: function () {
      return overlayStack.length ? overlayStack[overlayStack.length - 1] : null;
    },

    updateHud: function (g) {
      if (g.score !== lastScore) {
        lastScore = g.score;
        el('hud-score').textContent = String(g.score);
      }
      var combo = el('hud-combo');
      if (g.multiplier > 1) {
        combo.classList.remove('hidden');
        var text = 'x' + g.multiplier;
        if (combo.textContent !== text) {
          combo.textContent = text;
          combo.classList.add('pulse');
          setTimeout(function () { combo.classList.remove('pulse'); }, 160);
        }
      } else {
        combo.classList.add('hidden');
        combo.textContent = 'x1';
      }
    },

    resetHud: function () {
      lastScore = null;
      el('hud-score').textContent = '0';
      el('hud-combo').classList.add('hidden');
    },

    showGameOver: function (info) {
      el('over-score').textContent = String(info.score);
      el('over-best').textContent = String(info.best);
      el('over-newbest').classList.toggle('hidden', !info.isNew);
      this.show('gameover');
    },

    updateMenuBest: function (best) {
      var node = el('menu-best');
      if (best > 0) {
        node.textContent = RS.i18n.t('best') + ': ' + best;
        node.classList.remove('hidden');
      } else {
        node.classList.add('hidden');
      }
    },

    setHint: function (visible) {
      el('howto-hint').classList.toggle('hidden', !visible);
    },

    setSliders: function (music, sfx) {
      el('slider-music').value = String(Math.round(music * 100));
      el('slider-sfx').value = String(Math.round(sfx * 100));
    },

    bindOnce: function (handlers) {
      el('btn-play').addEventListener('click', handlers.onPlay);
      el('btn-again').addEventListener('click', handlers.onPlay);
      el('btn-pause').addEventListener('click', handlers.onPause);
      el('btn-resume').addEventListener('click', handlers.onResume);
      el('btn-pause-menu').addEventListener('click', handlers.onMenu);
      el('btn-over-menu').addEventListener('click', handlers.onMenu);
      el('btn-settings').addEventListener('click', handlers.onSettingsOpen);
      el('btn-close-settings').addEventListener('click', handlers.onSettingsClose);
      el('slider-music').addEventListener('input', function (ev) {
        handlers.onMusic(Number(ev.target.value) / 100);
      });
      el('slider-sfx').addEventListener('input', function (ev) {
        handlers.onSfx(Number(ev.target.value) / 100);
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
