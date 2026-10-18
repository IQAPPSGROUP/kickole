# Visual stage 3 — Brazilian street-football polish

## Changes
- Court: festa-style bunting (one `InstancedMesh`, 22 flags, one draw call, no textures) strung across the back wall.
- Footballer: GLB materials tuned per skin colour (matte cloth/skin, slightly glossy boots, faint self-glow so shaded sides stay readable). Rig, clips, 0.30 s contact frame untouched.
- Ball: glossier base, subtle glow, warm kick trail. Rotation, squash and contact flash logic unchanged.
- UI: gold game-over card/score, no-wrap PLAY AGAIN, compact score panel on short portrait screens (less overlap with signage), compact landscape game-over card. Sticky DONE in settings preserved.
- No physics, scoring, input, animation timing or dependency changes.

## Verification
- Automated: typecheck clean, 59/59 tests, production build OK.
- Browser emulation (headless Chromium, software GL, touch emulation): home, gameplay and game-over captured at 320x568, 390x844, 844x390. High and Low montages visually inspected; Medium captured, no overflow/errors recorded, but its images were not viewed. No page or console errors, no page overflow.
- Bundle: JS 1,257.32 -> 1,258.14 kB (gzip 348.09 -> 348.35); CSS gzip 3.21 -> 3.43 kB. GLB unchanged.
- Performance: not measured. Software rendering fps is meaningless; added cost is one instanced draw call and a few material parameters. No real-device testing was done.

## Remaining
- At 320x568 the score panel still touches the top of the sign.
- Landscape game-over card was only partly visible in the montage crop; layout checked numerically (no overflow) not by full-frame review.
- Real iPhone/Android performance and safe-area behaviour unverified.

## Stage 4A follow-up
- Short portrait screens (<=700 px tall): score panel compacted (YOUR RUN label hidden, 42 px score). At 320x568 the panel now ends at y=72 (+6 px shadow) while the sign's dark area starts at y~96 (pixel-measured in a Low-quality capture), up from a 93 px panel that touched the sign.
- `tools/check-layout.mjs` (dev tool, needs puppeteer-core + Chromium, not a dependency) asserts for 320x568 / 390x844 / 844x390 at Low/Medium/High: no page overflow, settings DONE reachable, game-over card fully on screen without scrolling, portrait score panel height, no page errors. Result: 9/9 PASS, PNGs saved.
- Landscape game-over (844x390): card is y=59..331, no clipping or scrolling (measured). **Not visually reviewed**: my image-viewing allowance for the session was used up, so the new captures, including Medium, were checked by measurement only, not by eye.

## Stage 4B
- Remote branch confirmed to contain 68c3389.
- `tools/check-layout.mjs`: 9/9 PASS again (Low/Medium/High x 320x568, 390x844, 844x390). Montages were generated, but **the image viewer's per-session limit was hit before any screenshot could be opened, so no visual check is marked as passed**. Overlap/clipping results above are DOM measurements and one pixel-row measurement only. Someone must open the PNGs written by the tool.
- Safe-area review (code only, `viewport-fit=cover` is set): top inset on `.screen`/`.hud`, bottom inset on touch-zone labels and cards, left/right insets on landscape home and score panel. Fixed: the landscape timing-feedback text now respects the right inset. Browser emulation reports insets of 0, so notch/home-indicator behaviour is **not verified on a device**.
- Touch targets: buttons/toggles >= 44-52 px, touch zones are full half-screens. Not tested on real Android/iOS hardware.
- Performance/asset loading: single JS bundle 1,258 kB (348 kB gzip), 172 KB GLB, no external assets; no frame-rate measurement is meaningful in software rendering.

## Stage 4C
- e0d1dbb confirmed on the remote branch. `tools/check-layout.mjs`: 9/9 PASS, nine-plus PNGs per run generated.
- **Visual inspection did not happen.** The image viewer refused every screenshot (per-conversation limit already used), so **no screenshot has been visually inspected** and nothing is marked visually verified: not Medium, not landscape game-over, not scoreboard/sign clearance, contrast, or styling.
- Substitute (not visual): DOM check of the game-over card at 320x568, 390x844, 844x390 (Medium): 10 text elements each, no overlapping text boxes, no truncated text, card horizontally centred.
- No defects were confirmed, so no code changes were made.
- Still needed: a person (or a session with viewer access) opens the PNGs from `node tools/check-layout.mjs`.
