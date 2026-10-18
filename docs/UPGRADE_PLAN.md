# Kickolé upgrade plan

Assessment of the prototype on `cursor/kickole-player-v2-6077` (base `cursor/footballer-motion-polish-2783`). Stage 1 is the only stage implemented in this pass.

## What exists

The game is a mobile-first keepie-uppie. One simulation, one camera, local save.

- Engine (`src/engine`): fixed-step ball, timing grades, alternate-foot bonus, foot stall, miss cooldown, drop, game over. No React or Three.js. Covered by `engine.test.ts`.
- Controller (`src/game/controller.ts`): storage, sound, haptics, HUD snapshot. Settings are sound, vibration, quality (`low` | `medium` | `high`), skin, and scene.
- Scenes (`src/game/scenes.ts`): `beach` (default, `PRAIA` / `BRAZILIAN BEACH`) and `rua` (`FUTEBOL DE RUA`). Physics does not change with the scene. `Beach.tsx` is a sand set. `Court.tsx` is the street set.
- Character: runtime model `public/models/kickole_player_v2.glb` (Quaternius, UE bone names, no clips). `GlbCharacter.tsx` drives it from `computePose` through `ue-pose.ts`. The clip contract rig `public/models/kicky-player-rigged.glb` still has Idle / KickLeft / KickRight / Miss / Celebrate and must keep passing `glb-asset` and animation-sync tests. `VITE_USE_GLB_CHARACTER=false` falls back to the primitive rig, which reads the same pose.
- Pose (`src/scene/pose.ts`): breathing idle, head tracks the ball, two-bone kick IK, 0.7 s arm raise after a perfect, droop after a drop. Contact timing is tied to `contactDelay` (0.04 s) and must stay aligned with the clip contact frame at 0.30 s.
- Ball (`src/scene/Ball.tsx`): sphere, flat pentagon cards, squash, grade flash, six-sphere trail on medium/high, blob shadow.
- Effects (`src/scene/Effects.tsx`, `fx.ts`): instanced sparks on perfect and every 10th kick, dust on drop, ground ring, camera shake and a small push. Shake is off on Low because the rig bails out entirely.
- Camera (`GameCanvas.tsx`): fixed three-quarter view, portrait/landscape fit, high-only room IBL, high-only contact shadows, one teal point light on the street (a second coral light from Medium up).
- Street court: one tiled green canvas, mural, KICKOLÉ sign, posters, fence, bins, bench, bunting, two floodlight meshes that do not match the point lights.
- HUD / screens: home, ready, playing, game over, settings. Home label uses `scene.place` and `scene.subtitle`.
- Save: best score and five runs in `localStorage` (`kicky.save.v1`). No XP, unlocks, or mode results.

## What is missing

- The street court still reads as a flat prototype box: one repeating paint texture, no goal, no brick, no festoon, lights that do not sit on the lamps.
- The v2 footballer only poses the contract joints. Idle is a small vertical bob. The perfect celebration is a short arm lift with no hop, and the camera barely moves. There is no separate response for a stall, an alternate-foot kick, or a streak other than a particle count.
- The ball is a lit sphere with decal cards. It has no panel texture, so the spin is easy to miss, and the trail is a row of spheres.
- Low turns camera feedback off completely. Medium and High differ mainly by DPR, shadow map size, antialias, particle cap, and one extra light.
- Modes, XP, achievements, cosmetic inventory, and extra World Tour sites are not in the engine or the save.

## Rules for every stage

- Reuse `GameEngine`. Mode rules stay out of `src/scene`.
- Add modes one at a time. Do not change kick timing, stall, scoring, or the clip contact contract while doing it.
- Keep `kickole_player_v2.glb` until a replacement rig has been tested in the browser. Do not retarget `kicky-player-rigged.glb`.
- Quality stays `low` | `medium` | `high`. Low must remain a real mode: no shadow map, no antialias, DPR 1, fewer particles and no festoon. Do not treat a desktop capture as a phone FPS result.
- Local save first. Shape new fields so a later account sync can copy them. Do not add a backend in these stages.

## Stage 1 — Graphics (this pass)

Uses the current v2 character and the existing street court. The beach stays selectable and is not the art target.

Will change:

- `src/scene/Court.tsx`: asphalt apron, a single painted pelada texture, brick sides, a street goal and net, planters, crates, a clothes line, lamp glow, and a festoon on Medium and High.
- `src/game/scenes.ts` street light rig only: warmer sun, wider fog, lights moved onto the floodlamps, a face fill. Beach numbers stay.
- `src/scene/GameCanvas.tsx`: quality-aware camera, street lights, slightly wider shadows, IBL a bit stronger on the street at High.
- `src/scene/Ball.tsx`: skinned panel texture, clearer spin, grade-coloured flash, a shorter trail on Medium and a longer one on High.
- `src/scene/Effects.tsx` and `src/scene/fx.ts`: perfect, stall, alternate, and streak bursts; a gold ring while a stall is held.
- `src/scene/camera-motion.ts`: pure kick-to-camera mapping so Low still gets a small push and lift, with shake only from Medium up.
- `src/scene/pose.ts`: idle sway, a ready knee as the ball drops, a longer perfect celebration (arms, hop, then a lean). Same channels `ue-pose.ts` already maps. No new bones, no new clips.
- `src/scene/GlbCharacter.tsx`: cloth / skin / boot roughness so the existing maps read under the new sun. No tint on textured skin or hair.

Will not change:

- Engine rules, scoring, input, or `contactDelay`.
- Clip selection, clip times, or the v2 / contract GLB files.
- Beach geometry, except a fix if a prop blocks the player during verification.
- Game modes, XP, levels, achievements, skins beyond the three that already exist, World Tour sites.

## Stage 2 — Timed modes (not this pass)

Add modes beside Freestyle without new rendering rules.

- Freestyle: today's keepie-uppie, unchanged.
- Skill Challenge: a short list of calls (left, right, stall, alternate) drawn from a seeded order. The engine checks the call; the scene only plays the existing kick and celebration.
- Time Attack 30 / 60 / 90: same kicks, a clock, score is kicks landed before time. Miss does not have to end the run; that rule lives in the mode, not in `Court` or `Ball`.
- UI: mode pick on the home screen. Result card shows the mode. Save stores the best per mode in a new object so `kicky.save.v1` best/leaderboard can stay for Freestyle.

## Stage 3 — Freestyle Battle vs AI (not this pass)

- One local opponent driven by the same engine with a timing error setting (easy / street / sharp). No networking.
- The opponent is a second pose of the same v2 rig, or a delayed score-only ghost if a second skinned mesh is too heavy on Low. Decide that with a Low capture, not by guessing.
- Leave a `matchId` field empty so a later multiplayer adapter can fill it. Do not add a socket in this stage.

## Stage 4 — Progression (not this pass)

- XP from kicks already scored: perfect, stall, alternate, and mode clear. Level is a pure function of XP.
- Achievements as ids (`first-perfect`, `stall-10`, `rua-100`) stored in a string array.
- Cosmetics: boots, kit, ball. The three current skins stay free. Locked ids ship in data with `unlocked: false`. Equip writes `skinId` as today.
- Save shape, still local: `{ best, leaderboard, xp, achievements, unlocked, equipped }`. A later sync copies this object. Do not invent an account system here.

## Stage 5 — World Tour (not this pass)

- More entries in `SCENES`, each a set-dressing component like `Beach` and `Court`. Physics stays on the same patch.
- A location unlocks from a Stage 4 level or achievement, not from a new currency.
- The street court remains `rua`. The beach remains the first-run default until a product decision says otherwise.

## Verification expected for Stage 1

- `npm test` and `npm run typecheck`.
- Browser: home shows the beach label, settings can select Street, the street set shows the goal and warmer light, the v2 player still kicks, a scored kick shows celebration and camera motion.
- Desktop browser captures are not a mobile FPS measurement.
