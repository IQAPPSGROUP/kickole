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

## Stage 2: mobile gameplay and controls (browser emulation only)

Checked in headless Chromium with mobile emulation (320x568, 390x844, 844x390; Low/Medium/High), real touch events on the zones. **No physical device was used.**

- Layout (script-measured, no page overflow, no JS errors): home, settings, game, game-over all fit at the three sizes and three quality levels. Only finding: at 320x568 and 844x390 the settings card scrolls internally and DONE was below the fold. **Fixed:** DONE is now sticky at the bottom of the card.
- Touch zones: `.zones` only live in the game screen; menus/settings/over cards use their own `pointer-events:auto` layer. Card scroll uses `touch-action: pan-y`. Confirmed by real touch tap launching the ball in each configuration; scrolling inside the card was not gesture-tested.
- Engine regression tests added (59 tests total): normal taps held 0-200 ms never become a stall; 8 rapid alternating taps keep the run alive and score the alternate bonus; a stalled ball stays frozen while held.
- Stall hold/release recaptured (inspector, frames viewed): foot (0.10, 0.613, 0.4215) and ball (0.102, 0.72, 0.62, vy 0) identical at 0.2/0.4/0.6 s; release at 0.6 s flicks the ball up (vy 4.49) and the foot continues smoothly.
- Miss: cannot be scrubbed in the inspector (the clip free-runs on state change). Viewed instead by hiding the game-over overlay and capturing the real game; the player leans and lowers the head as the ball drops and rests in the Miss pose. Early frames of the 1.5 s clip were not isolated.
- Idle->KickLeft vs KickRight speed difference: not reproduced as a pose asymmetry (kicking-foot positions at clip 0.26 s / 0.30 s are mirror-identical: x=-/+0.1, y 0.393/0.613, z 0.187/0.421). The earlier number was from coarse software-rendered frames, so no change was made. Not conclusively explained.
- Not verified: frame rate / memory / touch latency on real hardware, safe-area insets on notched devices (CSS uses `env(safe-area-inset-*)`, but emulation reports 0), iOS Safari behaviour.
