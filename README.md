# KICKOLÉ

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

## Status (v0.1)

Working and checked (unit tests, TypeScript, production build, headless-browser run driven by a timing bot): home/game/game-over screens, ball launch, timed kicks, scoring, combo, foot stall, local best, character kick/stall poses.
Implemented but only lightly checked: settings persistence, top-5 leaderboard UI, skins (3 free, cosmetic only), sound/vibration, WebGL error state.

Not done: real character models and animation clips, Capacitor projects, purchases (skin `productId` is a placeholder), tuning on physical devices.

## Character model

The footballer is currently built from primitives. A rigged GLB can replace it without code changes once it meets the spec in [`docs/CHARACTER_GLB.md`](docs/CHARACTER_GLB.md): put it at `public/models/kicky-player-rigged.glb` and build with `VITE_USE_GLB_CHARACTER=true`. Invalid or missing models fall back to the primitive character.
