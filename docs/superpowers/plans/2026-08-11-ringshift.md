# Ringshift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, and publicly deploy "Ringshift" — a certification-grade YouTube Playable (one-touch ring-switch arcade dodger) plus a form answer pack for the Playables application.

**Architecture:** Vanilla JS + Canvas 2D, no build step. Plain ordered `<script defer>` files each attaching one module to a global `RS` namespace via a UMD-ish wrapper so pure-logic modules also load in Node for unit tests. DOM overlays (real `<button>`s) for all UI; canvas only for the game scene. The YouTube SDK (`ytgame`) is wrapped in `RS.sdk` with a standalone shim.

**Tech Stack:** HTML5, Canvas 2D, WebAudio (all sound synthesized), Node built-in test runner (`node --test`) for logic tests, `npx http-server` for local serving, GitHub Pages for hosting.

## Global Constraints (from spec — apply to every task)

- SDK script `https://www.youtube.com/game_api/v1` is the FIRST script in `<head>`, no `defer/async`.
- Zero external network requests from game code (no CDN, fonts, fetch, XHR, WebSocket, analytics). System font stack only.
- In Playables env: cloud save ONLY (never localStorage); `loadData` must resolve/reject before any `saveData`.
- `firstFrameReady()` exactly once, before `gameReady()`; `gameReady()` exactly once, only when UI is interactive.
- Audio fully gated by `ytgame.system.isAudioEnabled()` + `onAudioEnabledChange`; separate Music/SFX sliders; NO master mute control.
- Pause/resume ONLY via SDK callbacks + in-game pause button; NEVER the Page Visibility API.
- Esc closes topmost overlay; never `preventDefault()` on Esc; every overlay also has a visible close/back button.
- All interactive targets ≥ 48×48 CSS px with ≥ 8px gaps; text contrast ≥ 4.5:1; visible focus states.
- `navigator.language(s)` never read; language = `ytgame.system.getLanguage()` in-env else `'en'`. Ships en/es/pt/fr/de.
- Scores sent via `sendScore({value})` are non-negative integers and always equal the saved best.
- Every `ytgame` call wrapped in try/catch; caught error may be `undefined`; game never blocks on SDK failure.
- All file references relative; filenames `[A-Za-z0-9_\-.]` only; state must survive live viewport resize; no orientation lock.
- Playable and crisp at 9:32, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9; DPR-aware rendering capped at 2.
- Windows dev environment: run commands with PowerShell syntax; repo root is `C:\Users\show-\Music\playable-games\ringshift`.

## File Structure

```
ringshift/
  index.html          — SDK tag, splash markup, canvas, UI containers, script tags
  css/style.css       — design tokens, splash, HUD, overlays, buttons, focus states
  js/sdk.js           — RS.sdk (ytgame wrapper + shim) and RS.saveCodec
  js/i18n.js          — RS.i18n: STRINGS for en/es/pt/fr/de, setLocale(tag), t(key)
  js/game.js          — RS.createGame(opts): pure simulation, no DOM/canvas/audio
  js/render.js        — RS.createRenderer(canvas): resize/DPR, starfield, scene draw
  js/audio.js         — RS.audio: WebAudio synth engine (SFX + generative music)
  js/ui.js            — RS.ui: screen/overlay switching, HUD updates, button wiring
  js/main.js          — boot sequence, state machine, rAF loop, SDK bindings
  tests/sdk.test.js, tests/i18n.test.js, tests/game.test.js
  README.md
  docs/superpowers/{specs,plans}/…
  docs/form-answers.md  — application form answer pack (Task 10)
```

UMD-ish wrapper used by every `js/*.js` file (Node + browser):

```js
(function (root) {
  'use strict';
  var RS = root.RS = root.RS || {};
  // …module body, attaches RS.something…
})(typeof window !== 'undefined' ? window : globalThis);
```

---

### Task 1: Scaffold, splash, SDK inclusion

**Files:**
- Create: `index.html`, `css/style.css`, `.gitignore`

**Interfaces:**
- Produces: DOM ids used by all later tasks: `#game-canvas`, `#splash`, `#screen-menu`, `#screen-gameover`, `#overlay-pause`, `#overlay-settings`, `#hud`, `#btn-play`, `#btn-settings`, `#btn-pause`, `#btn-resume`, `#btn-pause-menu`, `#btn-again`, `#btn-over-menu`, `#btn-close-settings`, `#slider-music`, `#slider-sfx`, `#hud-score`, `#hud-combo`, `#over-score`, `#over-best`, `#over-newbest`, `#howto-hint`, plus `data-i18n="key"` attributes on all static text nodes.

- [ ] **Step 1: Write `index.html`** — `<head>`: charset, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<title>Ringshift</title>`, SDK script tag first (`<script src="https://www.youtube.com/game_api/v1"></script>`), stylesheet, then the six game scripts with `defer` in order sdk→i18n→game→render→audio→ui→main. `<body>`: full-viewport `#game-canvas`, `#splash` (game title + `data-i18n="loading"` text + CSS pulse animation — must visibly communicate loading), hidden `#screen-menu` (title, tagline, Play primary button, Settings button), `#hud` (score, combo, pause button bottom-left), `#overlay-pause` (h2 `data-i18n="paused"`, Resume primary, Menu secondary), `#overlay-settings` (Music slider `#slider-music`, SFX slider `#slider-sfx` — `<input type="range" min="0" max="100">` with `<label>`s, Close button), `#screen-gameover` (h2 gameOver, `#over-newbest` hidden, score/best rows, Play again primary, Menu secondary), `#howto-hint` hidden.
- [ ] **Step 2: Write `css/style.css`** — tokens: `--bg:#0b0e1a; --ink:#eef2ff; --ink-dim:#9aa5c9; --accent:#4de3ff; --accent2:#ff4da6; --gold:#ffd54d; --danger:#ff5a5a; --panel:rgba(16,20,38,.92)`. (Contrast on #0b0e1a: #eef2ff ≈ 17:1, #9aa5c9 ≈ 7.6:1, #4de3ff ≈ 12:1 — all ≥ 4.5:1.) `html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-user-select:none;user-select:none;touch-action:manipulation}`. Canvas absolute inset 0. `.screen`/`.overlay` = absolute inset 0, flex-centered column, overlay bg `var(--panel)`; `.hidden{display:none!important}`. Buttons: min-height/width 48px, margin 8px, border-radius 12px, primary = accent bg with `#04121a` ink (dark-on-bright ≥ 4.5:1), secondary = transparent with 2px accent border; `:hover`/`:active` brightness states; `:focus-visible{outline:3px solid var(--gold);outline-offset:2px}`. Range inputs ≥48px tall tap area. HUD text with subtle text-shadow for legibility over starfield. `#btn-pause` fixed bottom-left with `env(safe-area-inset-*)` padding. Splash: centered title with neon glow (`text-shadow`), pulsing "Loading…" via `@keyframes`. `@media (prefers-reduced-motion: reduce){*{animation-duration:0s!important}}`.
- [ ] **Step 3: `.gitignore`** — `node_modules/` only.
- [ ] **Step 4: Verify** — `npx http-server -p 8080` from repo root; open `http://localhost:8080`. Expected: dark page, splash with pulsing Loading text, no console errors (404 for game scripts is expected until later tasks — create empty `js/*.js` placeholder files with just the UMD wrapper so console is clean).
- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: scaffold index.html, styles, splash"`

### Task 2: `RS.sdk` wrapper + `RS.saveCodec` (TDD)

**Files:**
- Create: `js/sdk.js`, `tests/sdk.test.js`, `package.json` (`{"name":"ringshift","private":true,"scripts":{"test":"node --test tests/"}}` — no dependencies)

**Interfaces:**
- Produces: `RS.sdk = { init():Promise<{save:object, lang:string}>, inEnv:boolean, firstFrameReady(), gameReady(), save(obj):Promise, sendScore(n):Promise, isAudioEnabled():boolean, onAudioEnabledChange(cb), onPause(cb), onResume(cb), logError() }`; `RS.saveCodec = { DEFAULTS, parse(str):object, serialize(obj):string }`. `RS.sdk._reset()` test hook. For tests: reading `globalThis.ytgame` is done lazily inside each call (never cached at load time).
- `RS.saveCodec.DEFAULTS = { v:1, best:0, music:0.8, sfx:1.0, gamesPlayed:0, totalGems:0, tutorialSeen:false }`.

- [ ] **Step 1: Write failing tests** in `tests/sdk.test.js` (Node test runner, `require('node:test')`, `require('node:assert')`, `require('../js/sdk.js')`):
  - `saveCodec.parse(undefined/null/''/'garbage'/'{}')` → deep-equals DEFAULTS (fresh copy each time, not shared reference).
  - `parse('{"v":1,"best":42}')` → best 42, other fields defaulted; unknown extra fields preserved (`parse('{"v":1,"zz":9}').zz === 9`); non-numeric `best` coerced to 0; `music:"x"` → 0.8.
  - `serialize(parse(s))` round-trips; result is valid JSON string.
  - With `globalThis.ytgame` undefined: `sdk.inEnv === false` (computed lazily via getter), `init()` resolves with `{save: DEFAULTS-shaped, lang:'en'}` (shim uses `globalThis.localStorage` if present, else in-memory), `firstFrameReady()/gameReady()/sendScore(5)` do not throw.
  - With fake `globalThis.ytgame = {IN_PLAYABLES_ENV:true, game:{...}, system:{...}, engagement:{...}, health:{...}}` (record calls): `init()` calls `game.loadData` and `system.getLanguage`; `sdk.save({best:1})` BEFORE `init()` resolves → does not call `game.saveData` (queued/dropped until load completed); after init, `save(obj)` calls `game.saveData(serialize(obj))`; `sendScore(12.7)` calls `engagement.sendScore({value:12})` (floor + `Math.max(0,…)`); `sendScore` when `engagement.sendScore` rejects → returned promise resolves (error swallowed, `logError` best-effort); `firstFrameReady` called twice → underlying API called once; `gameReady` before `firstFrameReady` → calls `firstFrameReady` first (order guaranteed); `getLanguage` rejecting → `init()` still resolves with lang `'en'`; `loadData` rejecting → resolves with DEFAULTS.
- [ ] **Step 2: Run** `npm test` → expect all FAIL (module missing).
- [ ] **Step 3: Implement `js/sdk.js`** — UMD wrapper. `saveCodec`: `parse` = try/catch JSON.parse, must yield non-null object else `{}`; result = `Object.assign({}, DEFAULTS-clone, parsed)` then field-coercion (`best`: `Number.isFinite(+v) && +v>=0 ? Math.floor(+v) : 0`; `music`/`sfx`: finite 0..1 else default; booleans via `!!`; counters like best). `sdk`: internal flags `loaded`, `firstFrameSent`, `gameReadySent`; `yt()` helper returns `globalThis.ytgame || null`; `inEnv` as getter `!!(yt() && yt().IN_PLAYABLES_ENV)`; every ytgame touch inside `try{}catch(e){ /* e may be undefined */ }`. `init()`: if inEnv → `Promise.allSettled([loadData, getLanguage])`, save = parse(loadResult or undefined), lang = langResult or 'en', set `loaded=true`; else shim: read `localStorage.getItem('ringshift-save')` guarded, lang 'en'. `save(obj)`: if `!loaded` → resolve immediately (drop); inEnv → `game.saveData(serialize(obj))` with `.catch(()=>{ logError-safe })`; else localStorage setItem guarded. `sendScore(n)`: `{value: Math.max(0, Math.floor(n)||0)}`, in-env only, always-resolving. Event registrations pass through to ytgame guarded; shim: `isAudioEnabled()` → true, `on*` → return noop unsubscribe.
- [ ] **Step 4: Run** `npm test` → all PASS.
- [ ] **Step 5: Commit** — `git add -A; git commit -m "feat: SDK wrapper with shim and tolerant save codec (TDD)"`

### Task 3: `RS.i18n` (TDD)

**Files:**
- Create: `js/i18n.js`, `tests/i18n.test.js`

**Interfaces:**
- Produces: `RS.i18n = { STRINGS, locale, setLocale(bcp47tag), t(key) }`, `RS.i18n.apply(rootDoc)` which sets `textContent` of every `[data-i18n]` element (browser only; guarded so Node require works).
- Exact key set (every locale must define all): `loading, tagline, play, settings, music, sfx, close, paused, resume, menu, gameOver, score, best, newBest, playAgain, howtoHint`.

- [ ] **Step 1: Write failing tests** `tests/i18n.test.js`: `setLocale('pt-BR')` → `locale==='pt'`; `'es-419'`→`'es'`; `'fr-CA'`→`'fr'`; `'de'`→`'de'`; `'ja-JP'`→`'en'` (unsupported → en); `undefined`/`''` → `'en'`; `t('play')` returns the es string after `setLocale('es')`; key parity: for each locale, same sorted key list as `en`; `t('missing-key')` returns `'missing-key'` (never undefined).
- [ ] **Step 2: Run** `npm test` → i18n tests FAIL.
- [ ] **Step 3: Implement `js/i18n.js`** with translations:
  - en: Loading… / Hop rings. Dodge. Survive. / Play / Settings / Music / Sound effects / Close / Paused / Resume / Menu / Game over / Score / Best / New best! / Play again / Tap to switch rings
  - es: Cargando… / Salta de anillo. Esquiva. Sobrevive. / Jugar / Ajustes / Música / Efectos de sonido / Cerrar / Pausa / Reanudar / Menú / Fin de la partida / Puntuación / Récord / ¡Nuevo récord! / Jugar otra vez / Toca para cambiar de anillo
  - pt: Carregando… / Pule de anel. Desvie. Sobreviva. / Jogar / Opções / Música / Efeitos sonoros / Fechar / Pausado / Continuar / Menu / Fim de jogo / Pontuação / Recorde / Novo recorde! / Jogar de novo / Toque para trocar de anel
  - fr: Chargement… / Sautez d'anneau. Esquivez. Survivez. / Jouer / Réglages / Musique / Effets sonores / Fermer / Pause / Reprendre / Menu / Partie terminée / Score / Record / Nouveau record ! / Rejouer / Touchez pour changer d'anneau
  - de: Lädt… / Wechsle Ringe. Weiche aus. Überlebe. / Spielen / Einstellungen / Musik / Soundeffekte / Schließen / Pausiert / Fortsetzen / Menü / Spiel vorbei / Punkte / Rekord / Neuer Rekord! / Nochmal spielen / Tippe, um den Ring zu wechseln
  - `setLocale`: lowercase, take part before `-`, use if in STRINGS else `'en'`.
- [ ] **Step 4: Run** `npm test` → PASS. **Step 5: Commit** `git commit -am "feat: i18n en/es/pt/fr/de (TDD)"`

### Task 4: `RS.createGame` simulation core (TDD)

**Files:**
- Create: `js/game.js`, `tests/game.test.js`

**Interfaces:**
- Produces: `RS.createGame({rng}) → g` with: `g.state` (`'running'|'over'`), `g.time`, `g.ship = {ring:1, angle, hop:{active,from,to,t}}`, `g.entities` (array of `{kind:'mine'|'comet'|'gem', ring, angle, age, armed?, vel?, nearMissed?}`), `g.score` (int getter), `g.multiplier` (1..5), `g.events` (array drained by caller each frame: `{type:'hop'|'gem'|'nearmiss'|'death'|'mine-armed'|'combo-up'|'combo-down', …}`), `g.hop()`, `g.update(dt)`. Constants exported as `RS.GAME_C`. Ring indices: 0=inner (radius 0.62 arena units), 1=outer (1.0). Renderer reads `ship.hop` to interpolate radius.
- Consumes: nothing (pure; `rng` injected, default `Math.random`).

- [ ] **Step 1: Write failing tests** `tests/game.test.js` (seeded LCG rng helper `mkRng(seed)` included in the test file):
  - Initial: state running, score 0, multiplier 1, ship on outer ring.
  - `update(1)` ten times → `g.time===10`, score === 100 (time points = `floor(time*10)`).
  - `hop()` → `ship.hop.active`; after `update(0.06)` (t<0.5·0.12 → collision ring still `from`); after total 0.12s → `ship.ring===0`, hop inactive; `hop()` during active hop is ignored.
  - Spawning: with seeded rng, after `update` past first spawn interval an entity exists; entity angles lie 1.2–2.6 rad ahead of ship in travel direction; mines start `armed:false` and arm after 0.8s (emits `mine-armed`).
  - Collision kill: place armed mine manually at ship ring/angle → `update(0.016)` → state `'over'`, `death` event; unarmed (telegraphing) mine at same spot → NOT dead.
  - Gem collect: gem at ship position → gem removed, `gem` event, score += 25×multiplier(before increment), multiplier becomes 2 (capped at 5); combo decay: after 5s without gem, multiplier steps down 1 (event `combo-down`).
  - Near-miss: armed mine on OTHER ring passing within 0.18 rad → `nearmiss` event once (flagged, not repeated), +5 score.
  - Comets: spawned comet has angular velocity sign opposite ship direction; comet on ship's ring at ship angle kills.
  - Difficulty: `omega(t)` ramps 1.2→2.4 clamped at 90s (`g.update` uses it; test via `RS.GAME_C` + exposed `g.omega()`).
  - Despawn: mine older than 6s removed; gem older than 8s removed.
  - Determinism: two games with same seed, same hop schedule → identical score after 30 simulated seconds.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `js/game.js`.** Constants per spec §2 (RING radii .62/1.0, SHIP_R .07, MINE_R .075, COMET_R .07, GEM_R .055 in arena units; OMEGA 1.2→2.4 over 90s; spawn interval 1.4→0.55 over 120s; HOP_TIME .12; MINE_TELEGRAPH .8; MINE_LIFE 6; GEM_LIFE 8; COMBO decay 5s; NEAR_MISS 0.18 rad / +5; GEM_PTS 25; TIME_PTS 10; DOUBLE_MINE after 30s at 20% of mine spawns). Update order: time += dt → ship.angle += omega·dt → hop progress → spawn timer (weights gem .45 / mine .40 / comet .15) → entity ages/comet motion/arming → collisions (effective ring = hop.t<0.5?from:to; hit if same ring && `angDist(a,b)·ringRadius < r1+r2` where angDist wraps to [0,π]) → near-miss check → gem pickup → combo decay timer → score accumulation (`gemPoints` int accumulator; `score = Math.floor(time*10)+gemPoints+nearMissPoints`). Death → state 'over', push event, stop further updates (early return when over).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git commit -am "feat: deterministic game simulation core (TDD)"`

### Task 5: Renderer

**Files:**
- Create: `js/render.js`

**Interfaces:**
- Produces: `RS.createRenderer(canvas) → r` with `r.resize()`, `r.draw(g, fx)` where `fx = {shake:0..1, slowmo:bool, particles:[…], reducedMotion:bool}`; `r.arena = {cx, cy, R}` (R = `min(vw,vh)*0.36`, recomputed in resize); `r.spawnBurst(x,y,color,n)`, `r.addTrail(...)` internal particle pool (max 400, reuse oldest).
- Consumes: `g` shape from Task 4.

- [ ] **Step 1: Implement** — `resize()`: `dpr=Math.min(devicePixelRatio||1,2)`; canvas.width/height = `clientWidth/Height * dpr`; `ctx.setTransform(dpr,0,0,dpr,0,0)`; regenerate starfield: `ceil(vw*vh/9000)` stars `{x,y,r:.5–1.8,phase}` across full viewport. `draw`: clear with bg `#0b0e1a`; stars twinkle via `sin(t+phase)` alpha (static if reducedMotion); apply shake translate (`±6px·shake`, 0 if reducedMotion); rings = two stroked circles, `strokeStyle` accent at 25% alpha, 3px, plus bright short arc segments rotating slowly (visual interest); core = filled circle radius `.18R` with radial gradient accent→transparent, pulsing ±4%; ship = triangle (size `.07R·1.9`) at `angle` on interpolated radius (`lerp(from,to,easeOutCubic(hop.t))`), rotated tangent+direction, color `#4de3ff`, `shadowBlur 18`; trail = last 14 ship positions as fading circles; mines: telegraphing = shrinking dashed warning circle (gold, alpha .35→.9) around spawn point, armed = 8-spike star polygon `#ff5a5a` glow; comets = circle `#ff4da6` with 10-step fading tail along its ring arc behind travel direction; gems = rotated-45° square (diamond) `#ffd54d` glow, gentle bob scale; particles from pool (position += vel·dt, alpha decay). All sizes derive from `R` so every aspect ratio just works. NO text drawn on canvas (HUD is DOM).
- [ ] **Step 2: Verify manually** — temporary harness in console (`RS.createGame` + renderer + rAF): scene renders, resize window live → arena recenters/rescales, starfield refills, no console errors, 60fps in DevTools performance panel.
- [ ] **Step 3: Commit** `git commit -am "feat: canvas renderer with starfield, glow entities, particle pool"`

### Task 6: Audio engine

**Files:**
- Create: `js/audio.js`

**Interfaces:**
- Produces: `RS.audio = { init(), ready:boolean, setEnabled(bool), setMusicVolume(0..1), setSfxVolume(0..1), suspend(), resume(), sfx(name, opts?), startMusic(), stopMusic() }`. `sfx` names: `'hop'|'gem'|'nearmiss'|'death'|'ui'|'fanfare'`; `sfx('gem',{combo})` pitches up with combo.
- Consumes: called by main/ui; volumes persisted via save.

- [ ] **Step 1: Implement** — Graph: `ctx → enabledGain (0|1, YouTube gate) → destination`; `musicGain` and `sfxGain` feed `enabledGain`. `init()` lazily creates AudioContext on first user gesture; guard `ctx.state==='suspended'` → `resume()`. `suspend()/resume()` call `ctx.suspend()/ctx.resume()` guarded + stop/restart music scheduler. SFX recipes (each: osc/noise → own envelope gain → sfxGain, stop+disconnect on end): hop = square 300→520Hz exp ramp 70ms, gain .25 decay; gem = sine at `660·(1+0.12·min(combo,5))` Hz + minor-third overtone, 140ms pluck envelope; nearmiss = bandpass(1800Hz, Q4) white-noise buffer 120ms swell; death = sawtooth 220→38Hz 500ms + white-noise burst 200ms, gain .4; ui = triangle 1200Hz 35ms tick; fanfare = three sines A4→C#5→E5, 90ms apart, 200ms each. Noise via one shared 1s pre-rendered buffer. Music: lookahead scheduler (setInterval 100ms, schedule 300ms ahead on `ctx.currentTime` grid, BPM 84): pad = two detuned triangles (±6 cents) at chord root (progression Am–F–C–G as frequencies A2/F2/C3/G2, 4 beats each) through lowpass 900Hz, gain .10; arp = one pentatonic note per half-beat from [A3,C4,D4,E4,G4,A4] random-walk (±1 step, rng ok here — not part of deterministic sim), sine, 180ms pluck, gain .07. `stopMusic` clears interval + kills scheduled nodes via a tracked list.
- [ ] **Step 2: Verify manually** — console: `RS.audio.init(); RS.audio.startMusic(); RS.audio.sfx('gem',{combo:3})…` — audible, no clicks/pops, `setEnabled(false)` silences everything instantly, `setMusicVolume(0)` kills music only.
- [ ] **Step 3: Commit** `git commit -am "feat: WebAudio synth engine — sfx + generative music, gated gains"`

### Task 7: UI + main wiring (boot, state machine, SDK bindings)

**Files:**
- Create: `js/ui.js`, `js/main.js`
- Modify: `index.html` (remove placeholder stubs if any)

**Interfaces:**
- Consumes: everything above.
- Produces: full playable game. `RS.ui = { show(name), openOverlay(name), closeOverlay(), topOverlay():string|null, updateHud(g), showGameOver({score,best,isNew}), bindOnce(handlers) }` where handlers = `{onPlay,onPause,onResume,onMenu,onAgain,onMusic,onSfx,onSettingsOpen,onSettingsClose}`.
- App states in `main.js`: `SPLASH → MENU → PLAYING ⇄ PAUSED → GAMEOVER`.

- [ ] **Step 1: Implement `js/ui.js`** — show/hide via `.hidden`; `show()` also moves keyboard focus to the screen's primary button (`focus({preventScroll:true})`); overlay stack array for Esc handling; HUD update writes `#hud-score` textContent only when changed; `showGameOver` toggles `#over-newbest`.
- [ ] **Step 2: Implement `js/main.js` boot sequence** (in an async IIFE on DOMContentLoaded):
  1. `requestAnimationFrame` once → `RS.sdk.firstFrameReady()` (splash is rendering).
  2. `const {save, lang} = await RS.sdk.init()`; `RS.i18n.setLocale(lang)`; `RS.i18n.apply(document)`; keep `save` as the single mutable session save object.
  3. Create game=null, renderer, wire `resize` listener (`renderer.resize()` — game state untouched → survives resize), wire input, wire SDK bindings, `ui.show('menu')`, hide splash, then `RS.sdk.gameReady()`.
  4. Global error hooks: `window.addEventListener('error'|'unhandledrejection', () => RS.sdk.logError())`.
- [ ] **Step 3: Input wiring** — `pointerdown` on canvas/document (ignoring events whose target is a button/slider/overlay): if state PLAYING → `game.hop()`, also first-gesture `RS.audio.init()`. `keydown`: Space/ArrowUp/Enter → same hop path (skip when focus is on a button — let native activation work); Escape → if `ui.topOverlay()==='settings'` close settings; else if PAUSED → resume; NO preventDefault anywhere on Escape; prevent default on Space only when hopping (avoid page scroll — allowed; restriction is Esc-specific).
- [ ] **Step 4: State transitions** — `startGame()`: `game=RS.createGame({})`, show HUD, hide screens, state PLAYING, `RS.audio.startMusic()`, first run (`!save.tutorialSeen`) → show `#howto-hint`, hide on first hop + `save.tutorialSeen=true` + `sdk.save(save)`. `pauseGame(fromSdk)`: state PAUSED, stop rAF updates (keep last frame), `RS.audio.suspend()`, open pause overlay, `sdk.save(save)`. `resumeFromOverlay()`: user-clicked Resume → state PLAYING, `RS.audio.resume()`, close overlay, reset `last` timestamp (no dt jump). `endGame()`: on death event → 0.6s slow-mo (dt×0.25) then state GAMEOVER: `save.gamesPlayed++`, `save.totalGems+=g.gems`, `isNew = g.score>save.best`, if isNew `save.best=g.score` (+fanfare sfx else death already played); `await sdk.save(save)` then `sdk.sendScore(save.best===g.score? g.score : g.score)` — always send this run's score (integer; YouTube keeps highest; saved best is already ≥ sent best → consistent); `ui.showGameOver`. `toMenu()`: stop music, show menu.
- [ ] **Step 5: SDK bindings** — `sdk.onPause(() => { if PLAYING → pauseGame(true); RS.audio.suspend(); sdk.save(save); })`; `sdk.onResume(() => { RS.audio.resume(); /* stay on pause overlay if PAUSED — explicit user resume */ })`; `RS.audio.setEnabled(sdk.isAudioEnabled())` at boot; `sdk.onAudioEnabledChange(on => RS.audio.setEnabled(on))`. Settings sliders: input event → `RS.audio.setMusicVolume(v/100)`, `save.music=v/100`; on settings close → `sdk.save(save)`. Slider initial positions from loaded save.
- [ ] **Step 6: rAF loop** — fixed-ish step: accumulate real dt (cap 50ms), `game.update(dt·slowmoFactor)` when PLAYING; drain `game.events` → sfx + particle bursts + HUD pulses (`gem`→sfx gem+burst gold; `hop`→sfx hop; `nearmiss`→sfx+spark; `death`→sfx death + big burst + shake 1.0; `combo-up` HUD pulse); shake decays ×0.9/frame; `renderer.draw(game, fx)` every frame (also when MENU/GAMEOVER: draw ambient scene with no ship? — simpler: keep drawing last game state dimmed behind panel; MENU before first game: draw rings+core+stars ambient idle with a slow demo ship, no hazards).
- [ ] **Step 7: Full manual verification** — serve; play multiple runs; check: splash→menu <1s; play/death/replay loop; combo builds and decays; pause button + Esc + resume; settings sliders change audio live and persist after reload (localStorage shim path); best persists; new-best fanfare + banner; howto hint only on first ever run; keyboard-only play possible; no console errors.
- [ ] **Step 8: Commit** `git commit -am "feat: UI, state machine, SDK lifecycle wiring — playable end-to-end"`

### Task 8: Polish pass

**Files:**
- Modify: `js/render.js`, `js/main.js`, `css/style.css`

- [ ] **Step 1** — Screen shake on death + micro-shake (0.15) on near-miss; slow-mo ramp on death; ship explosion = 40-particle burst in ship colors; gem sparkle idle particles; combo multiplier HUD scales/pulses on change with CSS transition; menu idle scene (slow ship orbiting, no hazards) behind panel; game-over panel slides/fades in (CSS, respects reduced-motion); dim canvas behind overlays via `rgba` veil.
- [ ] **Step 2** — `prefers-reduced-motion` audit: no shake, no pulse animations, particles halved, twinkle static.
- [ ] **Step 3** — Manual check at 9:32, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9 in DevTools responsive mode: arena centered+scaled, HUD/buttons reachable, text crisp with DPR 1/2/3 emulation, live resize mid-run preserves the run.
- [ ] **Step 4: Commit** `git commit -am "polish: fx, transitions, reduced-motion, aspect-ratio audit"`

### Task 9: QA + README + bundle audit

**Files:**
- Create: `README.md`
- Modify: anything QA surfaces

- [ ] **Step 1: Automated checks** — `npm test` all green. Static grep audits (must all return nothing): `navigator.language`, `visibilitychange`, `document.hidden`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `http://` / `https://` in js/css other than the single SDK tag in index.html + comments, `localStorage` outside the `inEnv===false` shim branch in sdk.js, `preventDefault` in any Escape code path.
- [ ] **Step 2: Size/perf audit** — total repo game files (`index.html`, `css`, `js`) size — expect < 100 KiB (limit 30 MiB initial, target 15 MiB — pass by ~150×); every file < 512 KiB; file count < 20; DevTools: load → interactive < 1s on "Slow 4G" throttle; heap < 30 MB after 5 minutes of play.
- [ ] **Step 3: Test Suite run** — serve on 8080; open `https://developers.google.com/youtube/gaming/playables/test_suite` in Chrome, point it at `http://localhost:8080`; verify in SDK events log: exactly one `firstFrameReady` then one `gameReady`; `loadData` before any `saveData`; `saveData` fires on game over/pause/settings-close; `sendScore` integer on game over; simulate Pause → game freezes+overlay+save; Resume → overlay stays until user clicks Resume; toggle audio off/on → silence/restore instantly (music sliders untouched). If browser automation (claude-in-chrome) is unavailable, provide the user a 2-minute click-through checklist instead and verify the same sequence via console logs from the shim locally.
- [ ] **Step 4: Save robustness** — in console (shim path): seed `ringshift-save` with `'garbage'`, `'{}'`, `'{"v":0,"best":"99"}'`, huge unknown-field object → reload each time → game boots clean, sensible values.
- [ ] **Step 5: Write README.md** — what the game is (1 paragraph + screenshot placeholder-free), controls, local dev (`npx http-server`), test suite instructions, certification notes table (link spec), repo layout, license note "All code, art and audio original; audio fully synthesized at runtime."
- [ ] **Step 6: Commit** `git commit -am "docs: README; qa: audits and fixes"`

### Task 10: Deploy to GitHub Pages + form answer pack

**Files:**
- Create: `docs/form-answers.md`

- [ ] **Step 1: Create repo + push** — `gh repo create ringshift --public --source . --push` (account mshowsary). 
- [ ] **Step 2: Enable Pages** — `gh api repos/mshowsary/ringshift/pages -X POST -f "source[branch]=master" -f "source[path]=/"` (or `-X PUT` if exists); poll `gh api repos/mshowsary/ringshift/pages` until `status: built`; verify `https://mshowsary.github.io/ringshift/` loads and plays (curl 200 + manual play).
- [ ] **Step 3: Write `docs/form-answers.md`** — ready-to-paste answers: game link(s) line (the Pages URL); games count "1"; 120-180 word game description (name, genre, one-touch hook, session length, SDK integration highlights: cloud save, sendScore, pause/audio compliance, 5 languages, <100 KiB, all aspect ratios); MAU answer ("No published games" unless user says otherwise); "Where do you publish" guidance (tick "Web" only if user actually has published web games — otherwise "No published games"); reasons-for-publishing suggestion (Enjoyment, Exposure, Learning + why honest selection matters); note that the description doubles as the Developer Portal description later (no branding/logos rule).
- [ ] **Step 4: Commit + push** `git add -A; git commit -m "docs: application form answer pack"; git push`

## Self-Review (done)

1. **Spec coverage:** §1–2 gameplay → Task 4 (sim) + 5 (visuals) + 8 (juice); §3 architecture/files → Tasks 1–7 match module list & contracts; §4 compliance rows each land in Task 1 (SDK tag), 2 (save/score/guards), 3 (i18n), 7 (lifecycle/audio/pause/input), 8–9 (aspect/perf/a11y audits), 9 (no-external-calls grep); §5 schema → Task 2; §6 errors → Tasks 2, 7; §7 testing → Task 9 (+ unit tests 2–4); §8 deploy/answers → Task 10; §9 exclusions respected (no ads/analytics/frameworks).
2. **Placeholder scan:** none — all steps carry concrete values, recipes, or exact commands.
3. **Type consistency:** `RS.sdk.init()→{save,lang}` consumed in Task 7 step 2; `RS.createGame({rng})`/`g.events` names match Tasks 4→7; `RS.audio.sfx(name,{combo})` matches Task 7 step 6; ui handler names consistent; `saveCodec.DEFAULTS` fields match spec §5 and Task 7 usage (`gamesPlayed`, `totalGems`, `tutorialSeen`, `music`, `sfx`, `best`).
