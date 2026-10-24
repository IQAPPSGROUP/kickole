# KICKOLÉ

KICKOLÉ is a mobile-first 3D street-football freestyle game by IQ Apps Group, with a realistic player, ball and court.
Tap at the right moment to keep the ball in the air, chase PERFECT timing, alternate feet and land foot stalls.

Stack: React + TypeScript + Vite, Three.js, React Three Fiber and Drei. No backend or API keys. The footballers are licensed Fab characters. The court uses CC0 Poly Haven textures plus original meshes. See `docs/REALISTIC_STYLE.md`.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # TypeScript check
npm test           # engine unit tests (Vitest)
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Controls

| Input | Action |
| --- | --- |
| Tap left / right half of the screen | Left / right foot |
| `A` / `D` | Left / right foot |
| `Space` | Start / restart |
| Hold a control on a good kick, then release | Foot Stall (+10) |

## Scoring

Kick-up 1 · Perfect +2 · Alternating foot +3 · Foot Stall +10.
Timing windows (Perfect 45 ms, Good 100 ms, Poor 160 ms) live in `src/engine/config.ts` and are measured against the simulated ball trajectory.
Best score and the top five runs are stored in `localStorage`.

## Structure

- `src/engine` – deterministic fixed-timestep simulation (no React / three.js), unit-tested.
- `src/game` – controller (storage, audio, haptics), skins, local save.
- `src/scene` – React Three Fiber scene; `pose.ts` is a renderer-agnostic procedural animation consumed by the placeholder rig (`Character.tsx`), so a GLB character can replace it later.
- `src/ui` – HUD, touch zones and menus.

## Deploying

Cloudflare Pages: build command `npm run build`, output directory `dist`. The build uses relative asset paths (`base: './'`), so it can later be wrapped with Capacitor for iOS/Android.
See `docs/PREVIEW_DEPLOY.md` for preview deployment and the device test checklist.

## Status (v0.1)

Working and checked (unit tests, TypeScript, production build, headless-browser run driven by a timing bot): home/game/game-over screens, ball launch, timed kicks, scoring, combo, foot stall, local best, character kick/stall poses.
Implemented but only lightly checked: settings persistence, top-5 leaderboard UI, skins (3 free, cosmetic only), sound/vibration, WebGL error state.

Native packaging: Capacitor (`com.iqappsgroup.kickole`). This release has no in-app purchases. The price is set in the stores. See [`docs/RELEASE_VALIDATION.md`](docs/RELEASE_VALIDATION.md). iOS TestFlight builds run on Codemagic; the hand steps are in [`docs/TESTFLIGHT.md`](docs/TESTFLIGHT.md). Web build remains the Cloudflare Pages target. Keep production store tracks unpublished until signed TestFlight / Play internal uploads are done.

## Brazilian environment kit

The court includes a textured hillside GLB selected by the existing graphics quality setting, with the original backdrop as a loading/error fallback. Seven reusable scene modules and three complete hillside detail levels live in `public/models/environment/`. See [`docs/BRAZILIAN_ENVIRONMENT.md`](docs/BRAZILIAN_ENVIRONMENT.md) for budgets, source generation, asset review and limitations. Run the dev server and open `/tools/environment-preview.html` to inspect the kit. Set `VITE_USE_GLB_ENVIRONMENT=false` to retain the built-in hillside.

## Brazilian beach kit

An optional beach theme includes ten textured GLBs, sand court, coastal sky/fog and three quality-selected backdrops. Street remains the default; build with `VITE_ENVIRONMENT_THEME=beach` for a beach release. In development use `/?environment=beach` to play or `/tools/environment-preview.html?theme=beach` to inspect the models. See [`docs/BRAZILIAN_BEACH.md`](docs/BRAZILIAN_BEACH.md) and [`docs/CURSOR_BEACH_HANDOFF.md`](docs/CURSOR_BEACH_HANDOFF.md).

## Character model

The street footballer is `public/models/kickole_player_v4.glb` (male) or `kickole_player_v4_female.glb`. Both are Fab Standard licence characters (artist artistofthemonth, licensed to Rob Stancombe t/a IQ Apps Group) on the same contract skeleton and the same five clips. Low quality loads the matching LOD1 file. Rebuild with `npm run build:player` after pointing `FAB_PLAYER_SRC` at the local Fab download. Do not commit that download. `kickole_player_v3.glb` and `kickole_player_v2.glb` stay as the stylised Quaternius sources, and `kicky-player-rigged.glb` remains the procedural reference for [`docs/CHARACTER_GLB.md`](docs/CHARACTER_GLB.md). See [`public/models/LICENSE`](public/models/LICENSE) and [`docs/REALISTIC_STYLE.md`](docs/REALISTIC_STYLE.md). Set `VITE_USE_GLB_CHARACTER=false` to select the primitive character. Invalid or missing models also fall back safely.

Both character renderers add expressive idle/ready movement, ball tracking, three touch gestures, stall balancing and varied reactions. V2 uses rig-specific complete arm poses for distinct reactions while retaining main's procedural leg transforms during live play. See [`docs/PLAYER_MOVEMENT.md`](docs/PLAYER_MOVEMENT.md) for validation and `/tools/movement-preview.html` on the dev server for a side-by-side motion review with nine selectable scenarios.

## Animation inspector (development only)
Run `VITE_USE_GLB_CHARACTER=true npm run dev` and open `http://localhost:5173/?inspect`. The panel lets you choose the foot,
switch between a plain kick and a foot stall, pause/play, step one frame (1/30 s) or scrub, and jump to the 0.25 / 0.30 / 0.35 s
clip times. It shows the tap-to-ball-response time, the ball position/velocity, the foot bone position and fps/frame-time/heap
(useful when the dev server is opened from a phone on the LAN). The inspector is not included in production builds.
`tools/capture-contact-frames.mjs` captures screenshots at those times (needs puppeteer-core and Chromium; not a project dependency).
The scene is rebuilt by replaying the real engine, so the frames match gameplay.

Foot contact: the engine responds `contactDelay` (0.04 s) after a tap. The default v2 rig follows the procedural leg pose at that instant. The older clip-based reference starts its kick clip at 0.26 s so its 0.30 s contact frame coincides with that response. The inspector retains that clip-time scale for kick scrubbing.
