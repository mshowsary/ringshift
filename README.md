# Ringshift

A one-touch neon arcade dodger built for **YouTube Playables**. Your ship
auto-orbits a glowing core on one of two rings — tap anywhere (or click, or
press Space) to hop between them. Dodge mines and comets, collect gems to
build a combo multiplier, and survive as the orbit speeds up. Sessions run
30 seconds to 2 minutes.

**Play it:** https://mshowsary.github.io/ringshift/

- 100% original code, art, and audio — every sound is synthesized at runtime
  with WebAudio (no audio files, no licensing encumbrances)
- Vanilla JavaScript + Canvas 2D, no engine, no build step
- ~58 KiB total, interactive in well under a second
- Localized: English, Spanish, Portuguese, French, German
- Playable in every aspect ratio from 9:32 phone-portrait to 32:9 ultrawide

## Controls

| Input | Action |
|---|---|
| Tap / click anywhere | Hop between rings |
| Space / ↑ / Enter | Hop between rings |
| Esc | Close settings / resume from pause |

## Run locally

No dependencies needed to play:

```
npx http-server -p 8080
# open http://localhost:8080
```

## Development

```
npm install        # dev-only: puppeteer-core for the browser harness
npm test           # unit tests (Node built-in test runner)
node tools/verify.js   # end-to-end browser verification (needs Chrome)
```

`tools/verify.js` drives headless Chrome through three passes: standalone
mode (the shim path GitHub Pages visitors get), a **fake Playables
environment** that intercepts the SDK script and asserts the certified
lifecycle (`firstFrameReady` → `gameReady` ordering, `loadData` before any
`saveData`, integer `sendScore` consistent with the saved best, SDK pause
freezing all rendering, resume semantics, localization from
`getLanguage`), and an aspect-ratio sweep across 8 ratios.

To verify in Google's official environment, serve the game locally and load
`http://localhost:8080` in the
[Playables Test Suite](https://developers.google.com/youtube/gaming/playables/test_suite).

## YouTube Playables integration

The SDK (`https://www.youtube.com/game_api/v1`) is the first script loaded.
`js/sdk.js` wraps every `ytgame` call defensively and provides a localStorage
shim outside the Playables environment, so the same bundle runs on the open
web and inside YouTube.

| Requirement | Where |
|---|---|
| `firstFrameReady` → `gameReady` ordering | `js/main.js` boot, enforced in `js/sdk.js` |
| Cloud save only in-env, `loadData` awaited before `saveData` | `js/sdk.js` |
| Version-tolerant save parsing | `RS.saveCodec` (`js/sdk.js`) |
| `sendScore` integer, consistent with saved best | `js/main.js` `endGame()` |
| SDK pause/resume halts game loop, audio, rendering | `js/main.js` (`sdkPaused`) |
| Audio gated by `isAudioEnabled` / `onAudioEnabledChange`; no master mute UI | `js/audio.js`, settings offer Music/SFX sliders only |
| Language from `getLanguage` (never `navigator.language`) | `js/main.js` + `js/i18n.js` |
| No external network calls, relative paths only | whole bundle (see `tools/verify.js` audits) |
| All aspect ratios, live resize safe | `js/render.js` `resize()` |
| WCAG AA contrast, ≥48px targets, focus states, reduced motion | `css/style.css`, `js/render.js` |

## Repo layout

```
index.html      entry point (SDK script first, then modules)
css/style.css   UI, HUD, overlays
js/sdk.js       ytgame wrapper + save codec
js/i18n.js      strings (en/es/pt/fr/de)
js/game.js      deterministic simulation (pure, unit-tested)
js/render.js    canvas renderer
js/audio.js     WebAudio synth (SFX + generative music)
js/ui.js        DOM screens/overlays/HUD
js/main.js      boot, state machine, SDK lifecycle
tests/          unit tests
tools/verify.js browser verification harness
```

The deployable game bundle is `index.html` + `css/` + `js/` only; `tests/`,
`tools/`, and `docs/` are development support.
