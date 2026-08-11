(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};

  var STRINGS = {
    en: {
      loading: 'Loading…',
      tagline: 'Hop rings. Dodge. Survive.',
      play: 'Play',
      settings: 'Settings',
      music: 'Music',
      sfx: 'Sound effects',
      close: 'Close',
      paused: 'Paused',
      resume: 'Resume',
      menu: 'Menu',
      gameOver: 'Game over',
      score: 'Score',
      best: 'Best',
      newBest: 'New best!',
      playAgain: 'Play again',
      howtoHint: 'Tap to switch rings'
    },
    es: {
      loading: 'Cargando…',
      tagline: 'Salta de anillo. Esquiva. Sobrevive.',
      play: 'Jugar',
      settings: 'Ajustes',
      music: 'Música',
      sfx: 'Efectos de sonido',
      close: 'Cerrar',
      paused: 'Pausa',
      resume: 'Reanudar',
      menu: 'Menú',
      gameOver: 'Fin de la partida',
      score: 'Puntuación',
      best: 'Récord',
      newBest: '¡Nuevo récord!',
      playAgain: 'Jugar otra vez',
      howtoHint: 'Toca para cambiar de anillo'
    },
    pt: {
      loading: 'Carregando…',
      tagline: 'Pule de anel. Desvie. Sobreviva.',
      play: 'Jogar',
      settings: 'Opções',
      music: 'Música',
      sfx: 'Efeitos sonoros',
      close: 'Fechar',
      paused: 'Pausado',
      resume: 'Continuar',
      menu: 'Menu',
      gameOver: 'Fim de jogo',
      score: 'Pontuação',
      best: 'Recorde',
      newBest: 'Novo recorde!',
      playAgain: 'Jogar de novo',
      howtoHint: 'Toque para trocar de anel'
    },
    fr: {
      loading: 'Chargement…',
      tagline: "Sautez d'anneau. Esquivez. Survivez.",
      play: 'Jouer',
      settings: 'Réglages',
      music: 'Musique',
      sfx: 'Effets sonores',
      close: 'Fermer',
      paused: 'Pause',
      resume: 'Reprendre',
      menu: 'Menu',
      gameOver: 'Partie terminée',
      score: 'Score',
      best: 'Record',
      newBest: 'Nouveau record !',
      playAgain: 'Rejouer',
      howtoHint: "Touchez pour changer d'anneau"
    },
    de: {
      loading: 'Lädt…',
      tagline: 'Wechsle Ringe. Weiche aus. Überlebe.',
      play: 'Spielen',
      settings: 'Einstellungen',
      music: 'Musik',
      sfx: 'Soundeffekte',
      close: 'Schließen',
      paused: 'Pausiert',
      resume: 'Fortsetzen',
      menu: 'Menü',
      gameOver: 'Spiel vorbei',
      score: 'Punkte',
      best: 'Rekord',
      newBest: 'Neuer Rekord!',
      playAgain: 'Nochmal spielen',
      howtoHint: 'Tippe, um den Ring zu wechseln'
    }
  };

  RS.i18n = {
    STRINGS: STRINGS,
    locale: 'en',

    // Accepts a BCP-47 tag from ytgame.system.getLanguage (e.g. "pt-BR",
    // "es-419"). Matches on the base language; unsupported -> 'en'.
    setLocale: function (tag) {
      var base = 'en';
      if (typeof tag === 'string' && tag.length) {
        base = tag.toLowerCase().split('-')[0];
      }
      this.locale = Object.prototype.hasOwnProperty.call(STRINGS, base) ? base : 'en';
    },

    t: function (key) {
      var table = STRINGS[this.locale] || STRINGS.en;
      if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
      if (Object.prototype.hasOwnProperty.call(STRINGS.en, key)) return STRINGS.en[key];
      return key;
    },

    // Browser only: stamp every [data-i18n] element with its translation.
    apply: function (doc) {
      if (!doc || !doc.querySelectorAll) return;
      var nodes = doc.querySelectorAll('[data-i18n]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = this.t(nodes[i].getAttribute('data-i18n'));
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
