# RingShift

A one-touch neon arcade dodger built for **YouTube Playables**. Your ship
auto-orbits a glowing core on one of two rings — tap anywhere (or click, or
press Space) to shift rings. Thread mines and comets, collect shards to build
your chain, fill FLOW to ignite a ×2 OVERDRIVE scoring burst, and survive as
the orbit speeds up. Runs last 30 seconds to 2 minutes.

**Play it:** https://mshowsary.github.io/ringshift/

- 100% original code, art, and audio — every sound is synthesized at runtime
  with WebAudio (no audio files, no licensing encumbrances)
- Vanilla JavaScript + Canvas 2D, no engine, no dependencies, no build step
- Under 70 KB total, interactive in well under a second
- Localized: English, Spanish, Portuguese, French, German
- Playable in every aspect ratio from 9:32 phone-portrait to 32:9 ultrawide
- Zero external network calls (the YouTube Playables SDK is the only external
  script, as required)

## Controls

| Input | Action |
|---|---|
| Tap / click anywhere | Shift rings |
| Space / ↑ / Enter | Shift rings (also starts a run) |
| Esc | Close dialogs |

## Run locally

```
npx http-server -p 8080
# open http://localhost:8080
```

To verify against Google's environment, load the local URL in the
[Playables Test Suite](https://developers.google.com/youtube/gaming/playables/test_suite).

## YouTube Playables integration

The SDK (`https://www.youtube.com/game_api/v1`) is the first script loaded;
`js/sdk.js` wraps every `ytgame` call defensively and falls back to
localStorage outside the Playables environment, so the same bundle runs on
the open web and inside YouTube.

- `firstFrameReady` on first splash render → `gameReady` once the menu is
  interactive (ordering enforced in the wrapper)
- Cloud save only in-env; `loadData` settled before any `saveData`;
  version-tolerant save parsing
- Best score persisted first, then sent via `engagement.sendScore` — the
  score YouTube shows always matches the save
- SDK `onPause` halts the loop, audio, and rendering; `onResume` restores
- Audio gated by `isAudioEnabled`/`onAudioEnabledChange`; separate Music/SFX
  sliders, no in-game master mute
- Language from `system.getLanguage` (never `navigator.language`)
