# Rigged GLB footballer – asset specification

The game loads `public/models/kickole_player_v4.glb` (male) or `kickole_player_v4_female.glb` on medium and high, and the matching `*_lod1.glb` on low. Both are realistic street footballers bought on Fab (artist artistofthemonth, Fab Standard licence, Personal tier, licensed to Rob Stancombe t/a IQ Apps Group). The female file has 21,203 triangles and the male file has 29,085 triangles. `tools/prepare_fab_player.py` and `tools/build_fab_player.ts` remap both onto one skeleton, the same bone names and the same five clips, so tricks and dances play on either. The raw Fab download is not in this repository. Set `FAB_PLAYER_SRC` to the local folder that contains `source_4.zip` and `source.zip` before `npm run build:player`. The body choice lives on `appearance.body` (`male` | `female`). Set `VITE_USE_GLB_CHARACTER=false` to use the primitive character without requesting the GLB. When enabled and the file is missing, is not a
binary glTF, fails to load, or lacks the required rig, the built-in primitive character (`src/scene/Character.tsx`)
is used. Contract constants live in `src/scene/rig.ts`; loading is in `src/scene/GlbCharacter.tsx` and
`src/scene/CharacterSwitch.tsx`. Rebuild v4 with `npm run build:player`.

## Format and licence
- Binary glTF 2.0 (`.glb`), one skinned mesh set sharing one armature, one scene.
- v4 is Meshopt geometry plus KTX2/Basis textures (`KHR_texture_basisu`, `EXT_meshopt_compression`). Albedo is 1024 (inside the 2K cap; 2K UASTC does not fit the first-load budget). Normals and ORM are 512, UASTC. Cloth and leather albedo are ETC1S. Each GLB stays under 8 MB. Only the LOD for the active tier is requested.
- The v4 bodies are Fab Standard licence assets. They may ship inside the app and the web build. The raw source (zips, FBX, blend) must not be redistributed. No club logos, real kits, or real player likenesses. See `public/models/LICENSE`.

## Scale, orientation and origin
- 1 unit = 1 metre. Standing height about 1.8 m (realistic proportions on v4). Keep feet-to-head height between 1.6 and 1.9.
- Y up, **facing +Z** (the model faces the camera/ball). Apply all transforms before export (scale 1, rotation 0).
- Origin on the ground at the centre between the feet. Feet touch y = 0 in the idle pose.
- Rest pose: relaxed A-pose or T-pose, legs straight, facing +Z.
- Bounding box width under 1 m in the idle pose.

## Skeleton (exact bone names, case sensitive)
| Purpose | Bone |
| --- | --- |
| Root / pelvis | `Hips` |
| Torso | `Spine` |
| Head | `Head` |
| Arms | `UpperArm_L`, `UpperArm_R` |
| Legs (thigh) | `UpperLeg_L`, `UpperLeg_R` |
| Legs (shin) | `LowerLeg_L`, `LowerLeg_R` |
| Feet | `Foot_L`, `Foot_R` |

Extra bones (neck, hands, toes, chest, forearms, etc.) are welcome. Left and right follow the game's screen/control convention: `_L` is world -X and `_R` is world +X while facing +Z. These are not anatomical left/right. Preserve this convention when importing or retargeting assets.
Up to 40 bones; at most 2 influences per vertex is preferred on mobile.

## Animation clips (exact names)
Exactly five clips, 30 fps, in place (no root motion), each exported as its own glTF animation:

| Clip | Loop | When it plays | Notes |
| --- | --- | --- | --- |
| `Idle` | yes | Home screen, ready state and between actions | Breathing, slight weight shift |
| `KickLeft` | no | Left-foot contact (and foot stall hold) | Foot meets the ball at **0.30 s** into the clip |
| `KickRight` | no | Right-foot contact (and foot stall hold) | Same timing, mirrored |
| `Miss` | no | Ball dropped / run over | Slumped shoulders, head down; holds last frame |
| `Celebrate` | no | After a PERFECT kick | Arms up, small hop |

Ball physics is authoritative: animations never move the ball. The game starts a kick clip at
`0.30 s - 0.04 s = 0.26 s` (see `KICK_CLIP_START` in `src/scene/rig.ts`) so the foot reaches the ball 0.04 s after the
engine registers the tap, matching the procedural pose. A foot stall freezes the kick clip at its 0.30 s contact pose.
Every clip should start and end close to the Idle pose so crossfades look clean. If a model lacks any of the five clips
the contract bones are driven procedurally from the shared pose logic (`src/scene/pose.ts`) as a fallback.

## Materials (exact material names)
Use `MeshStandardMaterial`-compatible (glTF PBR metal-rough) materials, one per name, so skins can recolour them:

`Shirt`, `Shirt_Trim`, `Shorts`, `Socks`, `Boots`, `Boots_Sole`, `Skin`, `Hair`

v4 also has an `Eyes` material, and the male GLB has `InnerMouth` (jaw, tongue and teeth). Those two are not tinted. The kit slots stay separate so runtime colour and the chest number still apply.

- Base colour is overwritten at runtime from the skin config (`src/game/skins.ts`) for the eight names above. Kit albedo is high-key so the swatch reads. Skin albedo is exposure-matched so the default swatch restores the photograph.
- Eyes stay opaque and double-sided. The male eyes are the authored eye mesh. The female eyes are the eye region split off the head so they are not tinted with the skin.
- No transparency or alpha-blended materials. Roughness stays distinct per slot so a glTF dedupe cannot merge the kit. Metalness 0.
- Do not bake lighting or shadows; the game lights the model.

## Budget
- LOD0 (`kickole_player_v4.glb` and `kickole_player_v4_female.glb`): the source mesh, 29,085 triangles for the male and 21,203 for the female (under the 50k cap), at most 40 bones, KTX2 albedo ≤ 2048. The shipped maps are 1024 on the long side so each GLB stays under 8 MB.
- LOD1 (`kickole_player_v4_lod1.glb` and `kickole_player_v4_female_lod1.glb`): 12k–15k triangles for the low tier, same skeleton and clips. Eyes, mouth and hair are barely simplified.

## Acceptance checklist
1. File loads with no console errors and `validateModel` reports no missing bones, clips or materials.
2. Faces the camera, feet on the floor, correct size next to the 0.28 m football.
3. All three free skins recolour correctly.
4. Kick contact frame lines up with the ball at Low, Medium and High quality.
5. Frame rate holds on a mid-range phone.
