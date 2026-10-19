# Expressive player movement

Branch `graphics/expressive-player-movement`, based on current main at `8089718` (after the street/beach merges and newer hillside framing fix). Both environments and the existing production theme are preserved.

## What changes

The existing five character clips gain a reversible, deterministic motion layer, shared by the GLB and primitive fallback. The character's geometry, skeleton, materials, skins and binary GLB remain unchanged. These are new runtime movement variations, not additional embedded GLB clips or new scoring moves.

| Situation | Added movement |
| --- | --- |
| Home / idle | Rhythmic weight shift, breathing accent, shoulder sway, small ankle flex and head turns |
| Ready | Quicker bounce and counter-swinging arms |
| Ball in flight | GLB head follows the ball, chest turns toward it, shoulders prepare for descent |
| Foot touch | Three alternating upper-body styles: open-body turn, opposite counter-turn, compact touch |
| Foot stall | Counterbalancing arms, subtle chest/shoulder adjustment and head focus |
| Perfect response | Arm-pump, shoulder-shimmy and two-hand salute variations layered over the authored celebration |
| Drop / game over | Brief head shake and arm reaction followed by settled recovery |

Motion uses engine time and action counters, without timers, random decisions or writes to the simulation. Touch variants remain stable when points are awarded at the response instant. Idle and reaction clips now sample the same simulation clock as contact clips; frozen review frames do not continue free-running.

## Contact safety and scope

The additive layer does not move the root or either foot during live play. Head, arms and chest are downstream of Spine, outside the leg hierarchy. During stalls both authored boot matrices remain exactly unchanged while upper-body balance animates. The existing 0.04-second ball response and 0.30-second authored contact frame, kick selection, held-foot timing and original clip crossfades are retained. The layer restores authored transforms before every mixer/procedural update, preventing cumulative rotation drift and handling repeated frozen samples and StrictMode cleanup.

No engine, controller, scoring, ball physics, inputs, UI, court assets, camera, deployment workflow or dependency changes. This update follows the user's choice of richer freestyle animation. Existing eleven-bone rig proportions limit elbow and finger articulation; the named salute/arm-pump are shoulder/arm gestures rather than newly articulated hands.

## Review

Run `npm run dev -- --host 127.0.0.1 --port 5189 --strictPort`, then open:

- `/tools/movement-preview.html`: base clips beside expressive movement, nine staged scenarios, pause/scrub and GLB/fallback choice.
- `/?inspect&environment=beach`: actual engine kick/stall replay and contact inspector.
- `/?environment=beach` or `/?environment=street`: actual game.

The comparison page uses the real renderers. Left/right touch and stall scenarios replay the actual engine. Idle/reaction examples are staged poses; celebration ball meshes are hidden there to keep the gesture visible. The animated GIF is sampled from staged review frames, not a real-time performance recording. The viewer is outside the production build; no movement selector was added to gameplay.

![Staged movement comparison](images/player-movement.gif)
![Held-foot balance comparison](images/player-stall.png)

## Verification

- `npm run typecheck`, `npm test`, `npm run build`: passed; 85 tests across nine files. Both default and beach builds were checked during implementation.
- New tests cover deterministic sampling, idle range, head tracking, gesture coverage, stable touch variants, unchanged simulation state, additive restoration without drift, stable paused clocks and identical GLB boot matrices through left/right stalls. Existing contact/animation/engine tests still pass.
- Browser review: nine scenarios in both GLB and primitive renderers, 18 captures.
- Rendered engine inspector: 12 left/right contact/stall samples; held-foot world position stays fixed within 1e-5, and releases send the ball upward.
- Repeated-juggle browser playback: street/beach at Low/High, normal engine inputs and fixed-step controller ticks; actual GLB joint traces confirmed. This scripted check avoids software-GPU timing jitter and is not a real-time input-latency or performance test.
- Production smoke: local beach build, Low/High at 390×844 and 844×390, actual keyboard input, character asset request and no page/graphics errors.
- Character-request failure still displays the animated primitive fallback.

Machine-readable record: `player-movement-validation.json`. Reproduce with the optional tools already used by the environment kits:

```sh
npm run typecheck
npm test
npm run build
# Requires isolated playwright-core in .validation and Chrome/Chromium:
node tools/check-movement-browser.mjs review
node tools/check-movement-browser.mjs contact
node tools/check-movement-browser.mjs game
# Against a locally served production build, set URL to that preview:
node tools/check-movement-browser.mjs production
python tools/make-movement-preview.py
```

Outputs are ignored under `movement-shots/`; selected previews and the report are committed. Browser tool accepts `URL` and `CHROMIUM`. Screenshots were reviewed for idle, stall and celebration comparisons and actual game captures; not every saved image was inspected individually.

## Remaining limits

Headless Chromium uses software rendering. Physical-device smoothness, sustained GPU/battery/thermal behaviour and real-time touch latency remain unverified. No hosted deployment was performed or verified. This branch preserves main's deployment settings; Cursor merge/deploy handoff is in `CURSOR_MOVEMENT_HANDOFF.md`.
