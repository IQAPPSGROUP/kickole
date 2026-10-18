# Kickole

KICKOLÉ is a mobile-first, stylised 3D football freestyle arcade game by IQ Apps Group.
Tap at the right moment to keep the ball in the air, chase PERFECT timing, alternate feet and land foot stalls.

Stack: React + TypeScript + Vite, Three.js, React Three Fiber and Drei. No backend, API keys or external assets.

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

Not done: Capacitor projects, purchases (skin `productId` is a placeholder), tuning on physical devices.

## Character model

The bundled procedural footballer uses a skinned GLB with five animations and follows [`docs/CHARACTER_GLB.md`](docs/CHARACTER_GLB.md). It loads from `public/models/kicky-player-rigged.glb` by default. Set `VITE_USE_GLB_CHARACTER=false` to select the primitive character. Invalid or missing models also fall back safely.

## Animation inspector (development only)
Run `VITE_USE_GLB_CHARACTER=true npm run dev` and open `http://localhost:5173/?inspect`. The panel lets you choose the foot,
switch between a plain kick and a foot stall, pause/play, step one frame (1/30 s) or scrub, and jump to the 0.25 / 0.30 / 0.35 s
clip times. It shows the tap-to-ball-response time, the ball position/velocity, the foot bone position and fps/frame-time/heap
(useful when the dev server is opened from a phone on the LAN). The inspector is not included in production builds.
`tools/capture-contact-frames.mjs` captures screenshots at those times (needs puppeteer-core and Chromium; not a project dependency).
The scene is rebuilt by replaying the real engine, so the frames match gameplay.

Foot contact: the engine responds `contactDelay` (0.04 s) after a tap, and the GLB kick clip is started at 0.26 s so its
0.30 s contact frame coincides with that response.
