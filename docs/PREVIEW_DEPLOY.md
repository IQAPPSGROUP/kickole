# Kickolé preview deployment (Cloudflare Pages)

Status: **no preview URL exists yet.** The agent environment has no Cloudflare credentials, so nothing was deployed.

## Config in the repo
- `npm run build` -> `dist/` (relative asset paths, `base: './'`); `public/_headers` is copied into `dist/` (immutable cache for hashed `/assets/*`, 1-day cache and `model/gltf-binary` for `/models/*`, `nosniff`).
- No SPA redirect is needed (single page). No `wrangler.toml`, no CI workflow, no secrets in the repo.
- The GLB footballer is on by default (`VITE_USE_GLB_CHARACTER=false` disables it).

## Option A: Cloudflare dashboard (recommended, no tokens in the repo)
1. Workers & Pages -> Create -> Pages -> Connect to Git -> `IQAPPSGROUP/kicky`.
2. Production branch: `main` (leave unchanged). Build command `npm run build`, output `dist`, Node 22 (`NODE_VERSION=22`).
3. Enable preview deployments for non-production branches. The push of `copilot/kicky-prototype-implementation` then deploys to `https://<hash>.<project>.pages.dev`, and `https://copilot-kicky-prototype-implementation.<project>.pages.dev` as the branch alias (the project name is chosen at creation).

## Option B: CLI
`npm run build && npx wrangler pages deploy dist --project-name <project> --branch copilot/kicky-prototype-implementation`
Needs `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID` in your shell. Do not commit them. A non-`main` `--branch` creates a preview, leaving production untouched.

## Verified locally (production build via `vite preview`, headless Chromium, mobile emulation, software GL)
- GLB served 200/206 as `model/gltf-binary`; no console errors or warnings; a touch tap starts the run and the game-over screen appears.
- The GLB-vs-fallback choice was not directly inspected in the production build (no console fallback warning was emitted); animations were verified earlier on the dev server only.
- NOT verified: the real Cloudflare deployment, real headers on Cloudflare, any physical device.

## iPhone test checklist (physical device)
- [ ] Opens over HTTPS; loading spinner then home screen within a few seconds on cellular.
- [ ] Portrait: KICKOLÉ title, sign and score panel do not overlap; notch/Dynamic Island and home indicator do not cover score or foot labels.
- [ ] Landscape: home layout, score at left, timing feedback at right, nothing under the notch; game-over card fully visible.
- [ ] Left/right taps feel immediate; the foot meets the ball; rapid alternate taps work; press-hold gives a foot stall, quick taps never do.
- [ ] Footballer is the 3D model (not blocky fallback); Miss and Celebrate animations look right.
- [ ] Game over: score, best, kick-ups, PLAY AGAIN and HOME work; Settings DONE is reachable; quality Low/Medium/High changes visuals.
- [ ] Page does not scroll/zoom/bounce while playing; sound and vibration toggles behave.
- [ ] Performance: smooth (target 60 fps, 30 minimum) over 5 minutes of play; device does not get hot; note model and iOS version.
