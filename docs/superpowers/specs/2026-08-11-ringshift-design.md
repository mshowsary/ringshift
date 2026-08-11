# Ringshift — Design Spec

**Date:** 2026-08-11
**Goal:** A certification-grade YouTube Playable to anchor the user's Playables interest-form application. Must be publicly hosted (GitHub Pages) and demonstrably meet every YouTube Playables certification requirement.

## 1. Concept

Endless one-touch arcade dodger. The player's ship auto-orbits a glowing core on one of two concentric rings. Tap / click / Space hops between inner and outer ring. Dodge hazards, collect gems to build a combo multiplier, survive as difficulty ramps. Sessions 30s–2min. Score is submitted to YouTube via `ytgame.engagement.sendScore`.

- **Working title:** Ringshift
- **Audience:** general (13+), no violence beyond abstract neon shapes
- **Visual style:** neon/synthwave — glowing rings, particle trails, starfield filling the whole viewport, subtle screen shake (disabled under `prefers-reduced-motion`)

## 2. Gameplay

### Core loop
1. Ship orbits automatically at angular speed `ω` on ring `inner` or `outer`.
2. Input (pointerdown anywhere / Space / ArrowUp / Enter) starts a ~120ms animated hop to the other ring. Collision is evaluated against the target ring after 50% hop progress (forgiving).
3. Hazards and gems spawn on rings ahead of the player. Colliding with a hazard = death. Touching a gem collects it.

### Entities
- **Mine:** spawns at a ring+angle with a 0.8s telegraph pulse (shrinking warning circle), then arms. Armed mines kill on contact. Despawn after ~6s with a fade (never mid-collision).
- **Comet:** travels along a ring opposite to the player's orbit direction at 1.3–1.8× player speed, killing on contact. Telegraphed by an incoming-direction glow at its spawn angle.
- **Gem:** static on a ring; collected on contact; despawns after ~8s.
- Hazards are spiky/angular shapes; gems are smooth diamonds — distinguishable by silhouette, not just color (colorblind-safe).

### Scoring & combo
- `score = floor(survivalTime * 10) + Σ(gemValue)` where `gemValue = 25 × multiplier` at collection time.
- Multiplier x1–x5: +1 per gem collected, decays one step after 5s without a gem.
- **Near-miss:** a hazard on the *other* ring passing within Δangle < 0.18 rad of the ship grants +5 points and a spark effect (juice, no death risk).
- Score is always an integer (SDK requirement).

### Difficulty ramp
- `ω` from 1.2 rad/s → 2.4 rad/s cap over ~90s.
- Spawn interval from 1.4s → 0.55s.
- From ~30s: occasional double-mines (both rings, same angle) forcing timed gaps between armed windows.

### Death & game over
Slow-mo (~0.25× for 0.6s) + explosion particles → game-over panel: score, best, "NEW BEST" celebration when applicable, Play Again (primary), Menu (secondary).

### Onboarding
No separate tutorial screen. First run only: pulsing "TAP to switch rings" hint overlaid during the first seconds of play, dismissed on first hop. `tutorialSeen` persisted in save.

## 3. Architecture

Vanilla JS + Canvas 2D. No engine, no build step, no external requests of any kind. Plain ordered `<script>` tags; each file attaches to a single global namespace `RS`.

```
ringshift/
  index.html          — SDK script tag FIRST, then css, then scripts in order
  css/style.css       — UI overlays, HUD, safe-area, WCAG AA colors
  js/sdk.js           — ytgame wrapper + standalone shim (RS.sdk)
  js/i18n.js          — strings en/es/pt/fr/de, RS.t(key) (RS.i18n)
  js/audio.js         — WebAudio synth: SFX + generative music (RS.audio)
  js/game.js          — state, entities, spawning, collision, scoring (RS.game)
  js/render.js        — canvas drawing, DPR-aware, resize (RS.render)
  js/ui.js            — menus, HUD, overlays, focus handling (RS.ui)
  js/main.js          — boot sequence, state machine, rAF loop wiring
  README.md
  docs/superpowers/specs/…
```

### State machine
`BOOT → SPLASH(loading) → MENU → PLAYING ⇄ PAUSED → GAMEOVER → (PLAYING | MENU)`
Overlays: SETTINGS (from MENU or PAUSED). Esc closes topmost overlay (no `preventDefault` on Esc). Every overlay also has a visible close/back button ≥48dp.

### Module contracts
- `RS.sdk`: `init()`, `inEnv`, `firstFrameReady()`, `gameReady()`, `loadData():Promise<string>`, `saveData(str)`, `sendScore(int)`, `getLanguage():Promise<string>`, `isAudioEnabled():bool`, `onAudioEnabledChange(cb)`, `onPause(cb)`, `onResume(cb)`, `logError()`. Standalone shim: localStorage for data, `navigator.language` NOT used — language falls back to `'en'`; all other calls no-op. Every SDK call wrapped in try/catch (SdkError may be `undefined`).
- `RS.audio`: `init()` (lazy, on first user gesture), `setEnabled(bool)` (YouTube-level gate), `setMusicVolume(0..1)`, `setSfxVolume(0..1)`, `suspend()`, `resume()`, `sfx(name)`, `startMusic()`, `stopMusic()`. Music = slow minor-pentatonic arpeggio pad, lowpass-filtered oscillators; SFX = hop blip, gem chime (pitch rises with combo), near-miss whoosh, death burst, UI click, new-best fanfare. Zero audio files.
- `RS.game`: `reset()`, `update(dt)`, pure state — no direct DOM/canvas access.
- `RS.render`: `resize()`, `draw(state, alpha)`; arena radius = `min(vw,vh) × 0.36`; DPR capped at 2; starfield regenerates to fill viewport on resize; particle object pool.

## 4. Certification compliance map

| Requirement | Implementation |
|---|---|
| SDK loaded before game code | `<script src="https://www.youtube.com/game_api/v1">` is the first script in `<head>` |
| `firstFrameReady` then `gameReady` | `firstFrameReady()` after first splash render; `gameReady()` when menu is interactive; enforced ordering in `main.js` |
| Cloud save only, `loadData` before `saveData` | `RS.sdk.init()` awaits `loadData` before menu; saves on game over, new best, settings change, and `onPause`; never localStorage in-env |
| Save works across versions | Versioned JSON `{v:1,…}`, tolerant parser: unknown fields kept, missing fields defaulted, parse failure → fresh save (no crash) |
| `sendScore` matches saved best | Both updated atomically in the same game-over routine |
| Audio: YouTube mute wins | Master gain node gated by `isAudioEnabled()` at init + `onAudioEnabledChange`; in-game Music/SFX sliders sit *under* that gate; **no master mute button** |
| Pause/resume via SDK only | `onPause`: cancel rAF, suspend AudioContext, flush save, show "Paused" overlay. `onResume`: resume. No Page Visibility API. In-game pause button (bottom-left, ≥48dp, away from YouTube chrome) triggers the same path |
| All aspect ratios 9:32 → 32:9 | Center-anchored arena scaled to `min(vw,vh)`; starfield + HUD fill/anchor to actual viewport; state survives resize; no orientation lock |
| Touch + mouse + keyboard | `pointerdown` covers touch/mouse; Space/ArrowUp/Enter play; Esc closes overlays; buttons ≥48×48dp with ≥8dp gaps |
| Crisp rendering | DPR-aware canvas; vector shapes only; system font stack (no font files, no CDN) |
| i18n | `getLanguage()` in-env (BCP-47, prefix-matched), fallback `en`; never `navigator.language`; ships en/es/pt/fr/de |
| No external calls | Zero fetch/XHR/WebSocket/CDN/fonts/analytics; passes production CSP (`connect-src 'self'`) |
| Stability | Bundle < 1 MiB total; < 10 files; load < 1s; JS heap ≪ 512MB; `window.onerror` + `unhandledrejection` → `health.logError()` |
| Trust & safety | 100% original code/art/audio (all synthesized); generic original title; 13+ safe abstract content |
| Prohibited items | No ads, no external links, no share prompts, no login-like screens, no QR codes, no exit button, no extra ToS, no icons mimicking YouTube controls |
| Accessibility | WCAG AA contrast (≥4.5:1 text), shape+color coding, `prefers-reduced-motion` respected, visible focus states |
| Content completion | Endless game — game-over screen always celebrates the run and shows progress (score/best) |

## 5. Save schema

```json
{ "v": 1, "best": 0, "music": 0.8, "sfx": 1.0,
  "gamesPlayed": 0, "totalGems": 0, "tutorialSeen": false }
```
Serialized with `JSON.stringify` (well-formed UTF-16 by construction), ≪ 500 KiB.

## 6. Error handling

- All `ytgame` calls in try/catch; caught error may be `undefined`; failures degrade silently (game never blocks on SDK).
- `loadData` rejection → fresh default save, game continues.
- `saveData`/`sendScore` rejection → retry once on next natural checkpoint, then drop.
- Global error hooks call `health.logError()` (rate-limited by YouTube; fire-and-forget).

## 7. Testing plan

1. **Playables Test Suite** (serve via `npx http-server`, load in the official suite): verify SDK event order (`firstFrameReady` → `gameReady`), pause/resume simulation, audio-toggle simulation, save/load, score send.
2. **Aspect ratios:** DevTools responsive mode at 9:32, 9:16, 3:4, 1:1, 4:3, 16:9, 21:9, 32:9 — playable, centered, crisp, state preserved across live resize.
3. **Input matrix:** touch (DevTools emulation), mouse, keyboard; Esc closes overlays without swallowing the event.
4. **Save robustness:** corrupt/legacy/empty save strings load without crash.
5. **Performance:** 60fps in gameplay; bundle-size audit; load-to-interactive < 5s (expect < 1s).
6. **Contrast:** spot-check UI text pairs ≥ 4.5:1.

## 8. Deployment & deliverables

1. Game bundle in `ringshift/` (repo root = Pages root = future Developer Portal upload).
2. GitHub repo under **mshowsary**, GitHub Pages enabled → public URL for the form.
3. README: what it is, how to run locally, how to load it in the Test Suite.
4. **Form answer pack** (separate doc): game description text + suggested answers for every visible form field.

## 9. Out of scope (YAGNI)

Ads (optional per cert; skipping removes a category), leaderboard UI beyond best score, multiple game modes, account systems (prohibited anyway), build tooling, frameworks, analytics (prohibited).
