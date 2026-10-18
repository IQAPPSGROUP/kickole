# Rigged GLB footballer – asset specification

The game loads `public/models/footballer.glb` (served as `/models/footballer.glb`) only when built with `VITE_USE_GLB_CHARACTER=true`
(e.g. `VITE_USE_GLB_CHARACTER=true npm run dev`), so default builds make no request for it. When enabled and the file is missing, is not a
binary glTF, fails to load, or lacks the required rig, the built-in primitive character (`src/scene/Character.tsx`)
is used. Contract constants live in `src/scene/rig.ts`; loading is in `src/scene/GlbCharacter.tsx` and
`src/scene/CharacterSwitch.tsx`.

## Format and licence
- Binary glTF 2.0 (`.glb`), one skinned mesh set sharing one armature, one scene.
- Compress for mobile: Draco or Meshopt geometry, KTX2/WebP textures. Target under 1.5 MB.
- Must be licensed for commercial use. No club logos, real kits, or real player likenesses.

## Scale, orientation and origin
- 1 unit = 1 metre. Standing height about 1.8 m (stylised proportions are fine, but keep feet-to-head height between 1.6 and 1.9).
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

Extra bones (neck, hands, toes, chest, forearms, etc.) are welcome. Left and right refer to the character's own left and right.
Up to 40 bones; at most 2 influences per vertex is preferred on mobile.

## Animation clips (exact names)
All clips at 30 fps, in place (no root motion). Clip names map to game states:

| Clip | Loop | When it plays | Notes |
| --- | --- | --- | --- |
| `Idle` | yes | Home screen and between actions | Breathing, slight weight shift |
| `Ready` | yes | Waiting for the first tap | Ball at feet, alert stance |
| `Kick_Left` | no | Left-foot contact | Foot meets the ball at **0.04 s**; total 0.3 to 0.45 s |
| `Kick_Right` | no | Right-foot contact | Same timing, mirrored |
| `Stall_Left` | yes | Foot stall held on the left foot | Foot raised, ball balanced, minimal motion |
| `Stall_Right` | yes | Foot stall held on the right foot | Mirrored |
| `Celebrate` | no | After a PERFECT kick (about 0.8 s) | Arms up, small hop |
| `Dejected` | no | Ball dropped / run over | Slumped shoulders, head down; holds last frame |

Kick clips must restart instantly: the game restarts the clip and crossfades in 0.04 s, so the contact frame is 0.04 s
after the tap. Every clip should start and end close to the Idle pose so crossfades look clean.
If a model provides all eight clips they are played; otherwise the contract bones are driven procedurally from the shared
pose logic (`src/scene/pose.ts`) as a fallback.

## Materials (exact material names)
Use `MeshStandardMaterial`-compatible (glTF PBR metal-rough) materials, one per name, so skins can recolour them:

`Shirt`, `Shirt_Trim`, `Shorts`, `Socks`, `Boots`, `Boots_Sole`, `Skin`, `Hair`

- Base colour is overwritten at runtime from the skin config (`src/game/skins.ts`); author them in neutral/white or a representative colour with no baked colour in textures that would tint wrongly.
- No transparency or alpha-blended materials. Roughness 0.5 to 0.9, metalness 0.
- Single material slot per mesh part; up to 8 materials, 1 to 2 draw calls per material.
- Do not bake lighting or shadows; the game lights the model.

## Budget
- Under 15k triangles, textures no larger than 1024 x 1024 (total under 2048 x 2048 atlas).

## Acceptance checklist
1. File loads with no console errors and `validateModel` reports no missing bones, clips or materials.
2. Faces the camera, feet on the floor, correct size next to the 0.28 m football.
3. All three free skins recolour correctly.
4. Kick contact frame lines up with the ball at Low, Medium and High quality.
5. Frame rate holds on a mid-range phone.
