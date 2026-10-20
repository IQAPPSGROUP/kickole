# Realistic street style

Kickolé’s street theme is a mobile-friendly realistic look: a photographed court, a modelled footballer, and physically based lighting. The beach theme keeps its existing light and court.

## Character

`kickole_player_v4.glb` (male) and `kickole_player_v4_female.glb` are the Fab footballers from artistofthemonth (see `public/models/LICENSE`). Both keep human proportions, a face and eyes. The male also keeps the inner mouth. The kit is its own materials (shirt, trim, shorts, socks, boots, sole) so colours and the chest number still come from `skinMaterialColors`. Hair is a separate material. Eyes and the inner mouth are not tinted. Neither body uses exaggerated or sexualised proportions. Materials are glTF PBR (base colour and normal, KTX2).

The two bodies are free. A first-launch picker writes `appearance.body`; older saves migrate to male and are not asked again. Customise can switch later. Only the selected body is loaded.

LOD0 is the source mesh: about 21k triangles for the male and 29k for the female. LOD1 is the low-tier mesh, about 13k triangles, same bones and the same five clips. Bone names stay on the contract in `docs/CHARACTER_GLB.md` (19 deform bones plus `Root`, under the 40-bone cap). Fingers, twist bones and face bones are merged into those deform bones. There is no `Clavicle_L`, so the runtime stays on the contract Euler path.

Clips are sampled from the procedural pose at 30 fps, eased between keys, with the 0.30 s kick frame forced onto the contact solve so the toe joint stays outside the ball while the boot can touch it.

## Ball and court

The ball is a clear-coat leather sphere with a stitched normal map and panel tint from the skin. The court uses Poly Haven asphalt and concrete (1K), with an original mural on the wall, a chain-link fence, bins and an instanced crowd outside the touchlines. `street_day_1k.hdr` is the sky and the image light: bright sky, warm ground bounce, and the key-light sun. The court package also includes the CC0 `sunflowers_puresky_1k.hdr`. The sky loads after the first paint.

## Rendering tiers

Graphics defaults to Auto. `detectTier` reads the GPU name when the browser exposes it, and otherwise the core and memory hints. A15 and newer, Apple M, Adreno 640 and up, Mali-G7xx and Immortalis stay on High even when memory is reported as 4 GB. A bare `Apple GPU` string does not, because Safari uses it for old and new phones; that device follows cores and memory. An explicit A14 or older name is not High. Low, Medium and High in Settings are a saved choice and are not clamped by the device. `stepFpsGuard` drops one runtime tier after the frame rate stays under 30 for five seconds, without writing settings. `?tier=low|medium|high` forces a tier for captures and skips the guard.

| | Low | Medium | High |
| --- | --- | --- | --- |
| Player | LOD1 | LOD0 | LOD0 |
| Shadows | off | variance, 512 map, tight box | PCSS, 1024 map, tighter box on the player |
| Contact shadows | off | on | off while PCSS is the shadow |
| IBL | sunny HDR | sunny HDR | sunny HDR |
| Post | AgX, warm grade | FXAA, warm grade, AgX | SSAO, linear bloom, DOF, AgX, warm grade, SMAA |
| Crowd | 8 | 16 | 28 |

AgX tone mapping stays on the street theme at an exposure of about 1.3. Faces stay lit by the fill light, not by lifting the whole frame. The street has no fog. The colour LUT runs after AgX: a gentle S-curve restores contrast, blacks stay slightly deep, and vibrance pushes the pinks, teals and yellows. Bloom samples the linear beauty pass before AgX and stays tight so highlights glow without a milk haze. Anti-aliasing follows the grade. Depth of field is on for the title (`menu`), a milestone celebration, and the game-over hold. SSAO is a hemisphere sample of the depth buffer; a failed depth target copies the colour through. The shadow itself is wide and lighter than black. PCSS replaces the basic shadow function: a blocker search widens the penumbra, and the ortho box stays on the player. The home label and tagline sit on a dark scrim so the light type stays readable on the sky.

## Download

The active player GLB is about 7 MB. Court colour maps and the Basis transcoder come with the first load. Normals, roughness and the sunny HDR are requested after the first paint so the initial art stays under about 15 MB. Low still loads the sunny HDR so the sky and the face fill match the other tiers. Low skips the detail maps.

## Licence

The footballers are Fab Standard licence assets, Personal tier, licensed to Rob Stancombe t/a IQ Apps Group. They ship inside the app and the web build. The raw download does not. Poly Haven `asphalt_02`, `concrete_wall_001` and `sunflowers_puresky` are CC0. The sunny sky, mural, ball shading and clips are original. Full text is in `public/models/LICENSE`.
