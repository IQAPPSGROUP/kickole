# Brazilian street-court styling — 18 October 2026

## Changes

- Original procedural sun, terracotta/green bands and pavement-style wave mural.
- Green painted court, warm side walls and gold training markings.
- Framed KICKOLÉ / FUTEBOL DE RUA sign with a matching 4:1 canvas and plane.
- Seeded paint wear, so reloads and quality changes keep the same court design.
- Gold play button, street-football branding and clearer first-play instructions.
- Opaque score panel and legible left/right control labels. Feedback sits below
  the sign on the main portrait layout rather than covering its lettering.
- Landscape home layout puts the branding and buttons beside the player.
- Compact portrait layout removes the tagline where it would overlap signage.
- Settings card can scroll: the page permits touch manipulation, while the
  canvas and gameplay touch zones continue to suppress native gestures.
- Visible keyboard focus and reduced-motion rules for CSS interface effects.
  These rules do not currently disable Three.js character/gameplay animations.

No new dependencies, downloaded imagery, external fonts or physics changes.

## Verification

- 55 tests passed; TypeScript and production build passed.
- Desktop Chromium with mobile/touch emulation, software rendering and DPR 1:
  home and ready screens visually inspected at 320x568, 390x844 and 844x390.
- Medium quality: home and kick-contact gameplay visually inspected at 390x844.
- Low quality: portrait/landscape home and ready screens inspected.
- Play/settings controls fit within the tested viewports. At 320x568, the
  settings card scrolled to Done and successfully returned to the home screen.
- No page exceptions recorded in these browser checks.
- Production assets: approximately 348 KB gzip JavaScript, 3.2 KB gzip CSS,
  plus the unchanged 172 KB GLB. These are transfer sizes, not speed measurements.

## Next approval stage

Complete animation review (especially Miss/Celebrate), quality-tier and mobile
interaction checks. Physical iPhone/Android frame rate, touch feel, safe-area
behaviour and sustained thermal performance remain unverified. Emulated software
rendering is not evidence of real-device performance.
