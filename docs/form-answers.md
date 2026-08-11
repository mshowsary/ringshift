# YouTube Playables interest form — answer pack

Ready-to-paste answers for the fields visible in your form screenshots.
Fields marked **[honesty required]** describe your real situation — only you
can answer them, but a recommendation is given.

---

## "Game(s) you wish for us to consider. Include links if you have them."

```
Ringshift — https://mshowsary.github.io/ringshift/
(Playables SDK already integrated: firstFrameReady/gameReady lifecycle,
cloud save via loadData/saveData, engagement.sendScore, pause/resume and
audio-settings compliance. Source: https://github.com/mshowsary/ringshift)
```

The link is a public hosted website (GitHub Pages) — satisfies the "no
Google Drive/Dropbox" rule.

## "How many games do you intend to publish?"

```
1
```

(Answer with a bigger digit only if you genuinely plan more — the form says
it's non-binding, just planning input.)

## "Describe your game(s)."

```
RingShift is a one-touch neon arcade dodger built specifically for YouTube
Playables. Your ship auto-orbits a glowing core on one of two rings; tapping
anywhere shifts rings to thread mines and comets, collect shards, and build
a scoring chain that charges FLOW — fill it to ignite a short ×2 OVERDRIVE
burst — while the orbit speeds up. Runs last 30 seconds to 2 minutes — ideal
for quick play sessions — and the best score is submitted through the
Playables SDK.

It was engineered to the certification requirements from day one: the SDK
lifecycle (firstFrameReady/gameReady), cloud saves (loadData awaited before
saveData, version-tolerant parsing), score/save consistency, SDK-driven
pause/resume that halts all execution, and audio fully gated by YouTube's
audio setting with separate music/SFX sliders and no in-game master mute.
The game is localized in English, Spanish, Portuguese, French, and German
via system.getLanguage, is playable in every aspect ratio from 9:32 to 32:9,
meets WCAG AA contrast with 48dp touch targets and reduced-motion support,
and makes zero external network calls. The whole bundle is under 70 KB of
dependency-free vanilla JavaScript — interactive in under a second — with
all art and audio original (sound is synthesized at runtime, so there are
no music licensing encumbrances).
```

(~190 words. Also reusable later as the Developer Portal description — it
contains no branding/logos, per the metadata rules.)

## "What is the combined Monthly Active Users for your game(s)?" [honesty required]

Recommended: **No published games** (if Ringshift is your first release).
Do not overstate MAU — the tiers are for planning, and honesty costs you
nothing here: the form explicitly accommodates "No published games."

## "Where do you publish games today?" [honesty required]

Recommended: **No published games** — unless you have actually shipped games
on any listed platform. (Ringshift being hosted on GitHub Pages as a demo
for this application is not "publishing on Web" in the sense they mean;
however, if you publish it to a storefront like itch.io before submitting
the form, ticking "Web (Facebook, Itch.io, etc.)" becomes accurate.)

## "For which reasons are you interested in publishing a game on YouTube?"

Pick what's true for you. A coherent, honest combination for a new
developer: **Enjoyment, Exposure, Learning** (add Build community and/or
Monetization if those genuinely motivate you).

---

## If the form asks anything about technical readiness

Useful true statements you can draw from:

- The game already integrates the current Playables SDK
  (`https://www.youtube.com/game_api/v1`) and passes an automated lifecycle
  verification equivalent to the SDK Test Suite checks (call ordering,
  save/score consistency, pause freeze, audio gating, localization).
- Initial download under 70 KB (requirement: <30 MiB, recommended <15 MiB);
  interactive in well under the recommended 5 seconds.
- No external network calls, no third-party services, no ads, no data
  collection of any kind.
- Content is original, abstract, and suitable for a general 13+ audience.
