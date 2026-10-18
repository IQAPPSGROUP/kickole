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
