# Kickolé — premium stylised footballer upgrade

The old reference model named below has been removed. The game uses the Fab players in `public/models/LICENSE`. Do not restore `kicky-player-rigged.glb`.

Status: historical specification. The Fab players replaced this plan.

## Objective
Replace the 172 KB procedural reference footballer with a polished, commercially licensed, mobile-ready stylised Brazilian street-football character. Retain the existing engine, controls, scoring and deterministic animation timing.

## Existing integration
- Loader: src/scene/CharacterSwitch.tsx and src/scene/GlbCharacter.tsx
- Contract: src/scene/rig.ts and docs/CHARACTER_GLB.md
- Removed asset: public/models/kicky-player-rigged.glb
- Retired generator: tools/generate_kicky_player.py (it exits before writing)
- Existing fallback: src/scene/Character.tsx

## Character art direction
Expressive arcade proportions, slightly enlarged head/hands/boots, readable silhouette, natural skin and hair shading, layered shirt/shorts/socks, boot panels and laces, restrained detailing. Avoid photorealism, real club marks and player likenesses. Preserve recolourable skin options.

## Asset acceptance contract
- Binary glTF 2.0, Y-up, facing +Z, ground origin, 1.6–1.9 m tall.
- Keep exact existing contract bones: Hips, Spine, Head, UpperArm_L/R, UpperLeg_L/R, LowerLeg_L/R, Foot_L/R.
- Keep exact animation names: Idle, KickLeft, KickRight, Miss, Celebrate.
- KickLeft and KickRight must contact at 0.30 s; 0.04 s game response is authoritative. Stall holds the 0.30 s frame.
- Keep exact existing material names: Shirt, Shirt_Trim, Shorts, Socks, Boots, Boots_Sole, Skin, Hair. Additional material slots require explicit loader support and tests.
- No root motion. Animation should preserve in-place court position. Preserve existing left/right world-axis convention.
- Target <15k triangles, <=40 bones, 1024px texture maximum per map, preferably <1.5 MB compressed. Measure on real phones before relaxing budget.
- Commercial rights must be documented. Never use unlicensed models or textures.

## Implementation stages
1. Produce character concept and GLB candidate; document asset provenance and licensing. Keep existing GLB untouched until candidate exists.
2. Validate geometry, orientation, named bones, material slots and animation clips; test contact positions at 0.26, 0.30 and 0.35 s.
3. Add character-specific PBR roughness and restrained emissive lighting while preserving colour overrides; test all three skins.
4. Capture actual visual comparisons at 320x568, 390x844, 844x390, across Low/Medium/High. Inspect screenshots visually, not only DOM measurements.
5. Run npm run typecheck, npm test, npm run build. Test actual iOS Safari and Android Chrome devices and record FPS, memory, loading and touch response.
6. Only after approval, switch the default asset. Preserve old model and primitive fallback. Do not merge to main or deploy production without approval.

## Known code risks
- GlbCharacter.tsx currently overwrites all material roughness with two values and adds emissive colour to all materials, which flattens material differentiation.
- Kick clips are intentionally advanced to 0.26 s on tap. Replacing animations without matching the contact pose will break visual alignment.
- Current headless-browser visual checks are incomplete and real-device performance has not been measured.

## Definition of done
New GLB visually inspected and contract-valid; both feet contact ball accurately; stall freezes at contact; five animations and all skins tested; no regression in engine tests; physical-device performance recorded; changes committed on graphics/stylized-character-upgrade, not main.
