# Footballer validation — 18 October 2026

Stage scope: bundled character integration, animation playback and rig contract.

## Changes

- Enabled the existing 171,856-byte procedural GLB by default, retaining the
  `VITE_USE_GLB_CHARACTER=false` escape hatch and invalid-file fallback.
- Fixed the React StrictMode effect replay: cleanup stopped mixer actions but
  retained the current-state cache, leaving the first animation stationary.
  Cleanup now resets both. The first contact was visually broken before this
  change and moved correctly afterwards.
- Active contact chooses its own foot explicitly. Documented that rig sides
  follow controls/world X, not anatomical left/right.
- Replaced a tautological ball-position assertion with X/Z hold checks.
- Added rendered contact and both-side stall assertions to the capture tool,
  including an initial-pose check before changing state.
- Documented the procedural source and added asset/generator MIT terms.

## Results

- 55 tests passed; TypeScript and Vite production build passed.
- Asset tests validate all five clips, required bones/materials, floor origin,
  height, forward kick direction and toe distance at the 0.30 s contact frame.
- Chromium, 390 x 844, mobile/touch emulation, software rendering: inspected
  home, both contact frames and both held stalls. No page exceptions recorded.
- Captured both feet at kick times 0.26/0.30/0.35 s and stall times 0.30/0.50/0.70 s.
  At held contact, foot bone Y/Z = 0.613/0.4215 for both sides; unchanged between
  hold samples. Ball Y = 0.72, vertical velocity = 0. After release it rises.
- Engine response occurs at 41.67 ms, the first 120 Hz physics step after the
  configured 40 ms delay. The sampled contact frame is about 0.302 s.

## Remaining checks

- These are emulated checks, not physical iPhone/Android performance results.
  Software-rendered frame rates are not suitable for mobile acceptance.
- Full portrait/landscape and quality-tier matrix belongs to the next stage.
- Idle is visible on home. Miss and Celebrate exist and load, but their full
  motion has not yet been visually approved.
- Home/court/signage were inspected only; wider Brazilian styling is the next
  separately approved stage. The current character remains a simple stylised
  procedural model, not a newly sourced artist-made character.
