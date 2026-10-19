# Realistic street style

Kickolé’s street theme is a mobile-friendly realistic look: a photographed court, a modelled footballer, and physically based lighting. The beach theme keeps its existing light and court.

## Character

`kickole_player_v4.glb` (male) and `kickole_player_v4_female.glb` are fitted from the CC0 MakeHuman hm08 base. Each body uses an athletic young macro target. Both keep human proportions, a face, eyes and teeth. Body faces under the kit are deleted. Jerseys, shorts, socks, shoes and hair are continuous CC0 MakeHuman clothes (see `public/models/LICENSE`), bound with the same mhclo fit onto that body. The male hair is an opaque short crop. The female hair is an opaque ponytail. The female jersey is the women’s t-shirt, with shorts refitted to the female hips. Neither uses exaggerated or sexualised proportions. Materials are glTF PBR (base colour, normal, ORM). Kit colours, numbers and hair colours come from `skinMaterialColors` on either body. A chest decal shows a number derived from the skin id. Eye texels (`u > 0.86`) are not tinted.

The two bodies are free. A first-launch picker writes `appearance.body`; older saves migrate to male and are not asked again. Customise can switch later. Only the selected body is loaded.

LOD0 is about 42–45k triangles. LOD1 is the low-tier mesh, same bones and the same five clips. Bone names stay on the contract in `docs/CHARACTER_GLB.md` (at most 40). There is no `Clavicle_L`, so the runtime stays on the contract Euler path.

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

The active player GLB is about 5.5 MB. Court colour maps and the Basis transcoder come with the first load. Normals, roughness and the HDR are requested after the first paint so the initial art stays under about 15 MB. Low does not request the HDR or the detail maps.

## Licence

MakeHuman hm08, Poly Haven `asphalt_02`, `concrete_wall_001` and `venice_sunset` are CC0. The kit, mural, ball shading and clips are original. Full text is in `public/models/LICENSE`.
