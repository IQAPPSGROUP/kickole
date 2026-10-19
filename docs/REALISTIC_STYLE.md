# Realistic street style

Kickolé’s street theme is a mobile-friendly realistic look: a photographed court, a modelled footballer, and physically based lighting. The beach theme keeps its existing light and court.

## Character

`kickole_player_v4.glb` (male) and `kickole_player_v4_female.glb` are the Fab footballers from artistofthemonth (see `public/models/LICENSE`). Both keep human proportions, a face and eyes. The male also keeps the inner mouth. The kit is its own materials (shirt, trim, shorts, socks, boots, sole) so colours and the chest number still come from `skinMaterialColors`. Hair is a separate material. Eyes and the inner mouth are not tinted. Neither body uses exaggerated or sexualised proportions. Materials are glTF PBR (base colour and normal, KTX2).

The two bodies are free. A first-launch picker writes `appearance.body`; older saves migrate to male and are not asked again. Customise can switch later. Only the selected body is loaded.

LOD0 is the source mesh: about 21k triangles for the male and 29k for the female. LOD1 is the low-tier mesh, about 13k triangles, same bones and the same five clips. Bone names stay on the contract in `docs/CHARACTER_GLB.md` (19 deform bones plus `Root`, under the 40-bone cap). Fingers, twist bones and face bones are merged into those deform bones. There is no `Clavicle_L`, so the runtime stays on the contract Euler path.

Clips are sampled from the procedural pose at 30 fps, eased between keys, with the 0.30 s kick frame forced onto the contact solve so the toe joint stays outside the ball while the boot can touch it.

## Ball and court

The ball is a clear-coat leather sphere with a stitched normal map and panel tint from the skin. The court uses Poly Haven asphalt and concrete (1K), with an original mural on the wall, a chain-link fence, bins and an instanced crowd outside the touchlines. `venice_sunset_1k.hdr` is the image-based light and sky. It loads after the first paint.

## Rendering tiers

Saved graphics quality is a ceiling. `detectTier` can only go lower, and `fallbackTier` drops high under 55 fps and any tier under 30 fps without writing settings. `?tier=low|medium|high` forces a tier for captures.

| | Low | Medium | High |
| --- | --- | --- | --- |
| Player | LOD1 | LOD0 | LOD0 |
| Shadows | off | one 512 map | soft 1024 map, wider frustum |
| Contact shadows | off | on | on |
| IBL | off | sunset HDR | sunset HDR |
| Post | hardware AA | FXAA, LUT, AgX | SSAO, bloom, replay DOF, FXAA, LUT, AgX |
| Crowd | 8 | 16 | 28 |

AgX tone mapping is applied on the street theme. Depth of field turns on only while `phase === 'over'`. Ground contact is the contact-shadow pass plus a high-tier depth darkening that writes the next buffer as beauty times a clamped occlusion, so a missing depth sample leaves the colour unchanged. Bloom is the same kind of write: the beauty sample plus a blurred highlight, not an in-place blend onto the colour target.

## Download

The active player GLB is about 7 MB. Court colour maps and the Basis transcoder come with the first load. Normals, roughness and the HDR are requested after the first paint so the initial art stays under about 15 MB. Low does not request the HDR or the detail maps.

## Licence

The footballers are Fab Standard licence assets, Personal tier, licensed to Rob Stancombe t/a IQ Apps Group. They ship inside the app and the web build. The raw download does not. Poly Haven `asphalt_02`, `concrete_wall_001` and `venice_sunset` are CC0. The mural, ball shading and clips are original. Full text is in `public/models/LICENSE`.
