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

## Animation verification stage (Miss / Celebrate / contact / stall)

**Visually inspected (headless Chromium, software GL, 390x844 emulation, `window.__kicky` bot):** Idle pose; kick pose with the ball at the foot and raised arm in Celebrate; Celebrate arm-raise; Miss lean-and-head-down while the ball drops; return to Idle after restart. Frames were viewed as a montage; the Miss clip's later frames are hidden by the game-over overlay and were not fully inspected.

**Browser trace (per-frame joint positions, `inspector.trace`, dev only):** max joint speeds at state switches: Celebrate->Idle 0.77 m/s, Miss->Idle 0.89, Idle->Miss 0.19 (smooth); Idle->KickRight 11.2 and Idle->KickLeft 18.9 m/s (fast by design: the kick clip skips its wind-up and crossfades for 0.04 s so the foot meets the ball at the physics response). Frames are coarse because software rendering is slow.

**Bug fixed:** the Celebrate window was measured from the contact but the state only begins after the 0.35 s kick window, so only ~0.45 s of the 1.2 s clip played. It now lasts `KICK_POST_CONTACT + 1.2` s, so the whole clip plays and ends on the Idle pose. Covered by a new test.

**Code-only checks:** kick clip time equals 0.30 s when the engine responds (`animation-sync.test.ts`); stall holds the clip at 0.30 s with foot position unchanged and the ball still (earlier inspection above).

**Not verified:** any real iPhone/Android device, real fps/memory, full Miss clip frames, left-kick entry speed asymmetry (18.9 vs 11.2 m/s) which is a possible polish item.
