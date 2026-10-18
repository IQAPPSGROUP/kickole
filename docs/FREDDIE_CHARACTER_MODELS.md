# Freddie character models (Quaternius CC0)

Branch `freddie/character-models`. These files do **not** replace `public/models/kicky-player-rigged.glb`; no game code was changed.

Licence: Quaternius Universal Base Characters [Standard], **CC0 1.0** (see `public/models/LICENSE.txt`).

## Differences from `docs/CHARACTER_GLB.md` contract (v1 and v2)
| Contract | This model | Fix needed |
|---|---|---|
| Bones `Hips, Spine, Head, UpperArm_L/R, UpperLeg_L/R, LowerLeg_L/R, Foot_L/R` | UE5-mannequin names: `pelvis, spine_01..03, Head, upperarm_l/r, thigh_l/r, calf_l/r, foot_l/r` (`Head` matches) | rename in Blender or add a name map in `rig.ts` |
| `_L` = world −X (screen/control side), facing +Z | model faces +Z; Quaternius `_l` is anatomical left = world **+X** → `upperarm_l` maps to contract `UpperArm_R` | swap sides when mapping |
| ≤ 40 bones, ≤ 2 influences/vertex preferred | 65 bones (fingers), up to 4 influences | delete finger/leaf bones + limit weights if required |
| Exactly 5 clips `Idle, KickLeft, KickRight, Miss, Celebrate` (30 fps, in place, contact 0.30 s) | **no clips** | author/retarget clips (see below); game falls back to procedural pose |
| Materials `Shirt, Shirt_Trim, Shorts, Socks, Boots, Boots_Sole, Skin, Hair` | v1: `Skin, Kit_Shirt, Kit_Shorts, Kit_Socks, Boots, Hair, Eyes`; v2: contract names + `Eyes` | v1 wrong names; v2 has one extra (`Eyes`, 9 total vs max 8) |
| Base colours neutral, overwritten at runtime | `Skin` and `Hair` use colour textures (runtime colour multiplies them) | tint skin via `color` near white only |
| < 15k tris, < 1.5 MB, textures ≤ 1024 | v1 15,619 tris / 375,864 B; textures ≤ 1024 WebP | v1 slightly over tris |
| T/A-pose rest, feet at y=0, origin between feet, height 1.6–1.9 m | T-pose, feet y≈0, ~1.84 m | OK |
| Idle bbox width < 1 m | T-pose arm span ~1.86 m (no Idle clip yet) | resolved once an Idle clip lowers arms |
| Meshopt/Draco + KTX2/WebP | Meshopt + WebP (`EXT_meshopt_compression`, `EXT_texture_webp`) | the loader must set a Meshopt decoder |

## v1 – `public/models/kickole_player_v1.glb`

Source: Quaternius **Universal Base Characters [Standard]** – `Superhero_Male_FullBody` (Godot/UE glTF) + `Hair_SimpleParted` (rigged to head bone).
Licence (from `License_Standard.txt` in the pack): **CC0 1.0 Universal – Public Domain Dedication** (https://creativecommons.org/publicdomain/zero/1.0/). Commercial use OK, no attribution required (credit "Quaternius" is appreciated).

## File
| | |
|---|---|
| Size | 375,864 bytes (~367 KB) |
| Triangles | 15,619 total (body 12,566 · hair 1,301 · eyebrows 984 · eyes 768) |
| Compression | `EXT_meshopt_compression` + `KHR_mesh_quantization`, textures `EXT_texture_webp` |
| Textures | body base colour + normal 1024² WebP; hair base colour + normal 512² WebP; eyes 256² WebP. Roughness map dropped (constant roughness 0.75). |
| Units / up | metres, Y-up, ~1.84 m tall, feet at y≈0, **T-pose** bind pose, no animations included |
| Draw calls | 8 skinned primitives (body split into 5) |

## Skeleton
One skin, **65 bones, UE5-Mannequin naming** (NOT Mixamo): `root, pelvis, spine_01..03, neck_01, Head, clavicle_l/r, upperarm_l/r, lowerarm_l/r, hand_l/r, (index|middle|ring|pinky|thumb)_01..03 + _04_leaf, thigh_l/r, calf_l/r, foot_l/r, ball_l/r, ball_leaf_l/r`. Hair + eyebrows + eyes are all bound to this same skin (hair weights 100 % `Head`).

## Materials (all `MeshStandardMaterial` after load)
| name | use |
|---|---|
| `Skin` | original textured body (head, neck, forearms, hands) |
| `Kit_Shirt` | flat #FFD93D, body normal map @0.35 (torso + upper arms) |
| `Kit_Shorts` | flat #1E2A5A (pelvis + thighs) |
| `Kit_Socks` | flat #FFD93D (calves) |
| `Boots` | flat #FF4F9A (feet) |
| `Hair` | grey texture tinted dark brown via baseColorFactor (used by Hair + Eyebrows) |
| `Eyes` | eye texture |

The original body is a **single skin-suit material** (skin + dark briefs, no clothing). The kit materials were made by splitting the body triangles by dominant bone weight, so the kit is just recoloured body surface (no real shirt/boot geometry, feet still show toes) and seams are slightly jagged at waist/knees/ankles. Recolour kits at runtime by setting `material.color` on the `Kit_*` / `Boots` materials, or give them a `map` (kit texture painted on the body UVs, `TEXCOORD_0`). Better later: model a proper shirt/shorts/boots mesh in Blender bound to the same skeleton.

## Loading (R3F + drei)
```jsx
import { useGLTF, useAnimations } from '@react-three/drei'
import { useEffect, useRef } from 'react'

export function Player({ kit = '#FFD93D', shorts = '#1E2A5A', anim = 'idle', ...props }) {
  const group = useRef()
  const { scene, materials, animations } = useGLTF('/models/kickole_player_v1.glb') // drei wires the meshopt decoder by default
  const { actions } = useAnimations(animations, group)   // empty until clips are added
  useEffect(() => { materials.Kit_Shirt.color.set(kit); materials.Kit_Socks.color.set(kit); materials.Kit_Shorts.color.set(shorts) }, [kit, shorts])
  useEffect(() => { actions[anim]?.reset().fadeIn(0.15).play(); return () => actions[anim]?.fadeOut(0.15) }, [anim, actions])
  return <primitive ref={group} object={scene} {...props} />
}
useGLTF.preload('/models/kickole_player_v1.glb')
```
For multiple players use `SkeletonUtils.clone(scene)` (three/examples/jsm/utils/SkeletonUtils.js) and clone the kit materials per instance. Set `frustumCulled = false` on the skinned meshes if they pop out at screen edges.

## Animations – next steps
1. **Quaternius Universal Animation Library** (https://quaternius.com/packs/universalanimationlibrary.html, CC0) and **UAL 2** (https://quaternius.com/packs/universalanimationlibrary2.html, CC0) are made on the same "universal humanoid" UE-style rig as these characters, so clips should play on this skeleton directly by bone name. Useful for `idle` (Idle_Loop), celebrate (Dance_Loop / emotes), stumble/`miss` (Hit_* ), jogs/sprints. Neither has football kicks, juggling, foot stall or around-the-world.
2. Football clips from **Mixamo** (soccer kicks, juggling, victory) use `mixamorig:*` bones, so they must be **retargeted** to this UE skeleton: in Blender (import Mixamo FBX + this GLB, retarget with Rokoko/Auto-Rig Pro/"Mixamo→UE" bone map, bake actions) and export clips into this GLB, or at runtime with `SkeletonUtils.retargetClip` and a bone-name map (`mixamorigHips→pelvis`, `mixamorigSpine→spine_01`, `mixamorigLeftUpLeg→thigh_l`, …). Offline Blender baking is more reliable.
3. Name clips exactly: `idle, kick_l, kick_r, miss, celebrate, juggle, foot_stall, around_world`. `around_world` will likely need code-driven ball motion + a leg-circle clip.
4. Rebuild script: `tools/freddie/build_player_v1.mjs` (gltf-transform 4.5 + meshoptimizer + sharp).
