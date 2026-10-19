# Brazilian hillside / street-football environment

Branch: `graphics/brazilian-street-environment`, based on `main` at `9244f51`.

## Art and scope

Ten reusable GLBs, a source atlas, deterministic generator, three assembled detail levels, and a development orbit viewer. The hillside has layered pastel houses, exposed brick infill, ceramic tiled bases, glazed windows, wooden shutters, balcony bars, projecting corrugated awnings, drainpipes, AC units, terracotta roof variants, water tanks, solar panels, TV aerials, a grocery storefront, produce crates, an 18-step alley, planters, laundry and sagging utility wires. Seven full-detail modules can be placed in other scenes.

The previous chat's images were not recoverable: its cached history contained text references but no attachments or image contents. No reference images were found in the local project mirror or repository. Art direction follows the existing teal/coral/ochre game palette and the Brazilian hillside / street-football brief. **Matching the original pictures is unverified.** These are stylized procedural game assets; photographic fidelity or a particular real neighbourhood is not claimed.

## Integration

`EnvironmentBackdrop.tsx` replaces only `HillsideNeighbourhood` inside `Court.tsx`; `GameCanvas.tsx` passes the existing quality setting. No engine, controller, physics, scoring, input, character model, animation timing, UI, court geometry, lighting, camera or workflow changes.

High → LOD0, Medium → LOD1, Low → LOD2. These are **quality-selected static LODs**, not distance-switched LODs. Only the selected file is downloaded. The original hillside remains visible during loading and on model errors; set `VITE_USE_GLB_ENVIRONMENT=false` at build time to use it throughout.

Game placement is scale `0.9`, offset `[-1.6, -0.7, -1.8]` so pastel facades sit in the phone and desktop camera frame above the fence. Every transformed backdrop vertex is behind `z=-4.4`, outside the court walls and play area. Backdrop materials ignore scene fog so court fog does not wash them into the sky. The back wall hides lower facades in gameplay; the orbit viewer exposes the entire kit. The backdrop adds one opaque draw call with no shadow casting, animation updates, collision or simulation. `useGLTF` caches resources; switching through all quality levels retains those assets in memory. Standalone prop files are not downloaded by gameplay.

## Asset budgets

All files have one material and one embedded 1024² PNG. Figures below are measured file sizes; gzip is a local compression measurement, **not a verified Cloudflare transfer size**.

| Backdrop | Triangles | GLB bytes | Local gzip bytes |
| --- | ---: | ---: | ---: |
| High / LOD0 | 34,360 | 3,186,636 | 805,323 |
| Medium / LOD1 | 14,720 | 1,479,272 | 556,730 |
| Low / LOD2 | 9,700 | 1,086,892 | 490,642 |

Full-detail standalone models range from 420 to 2,504 triangles. Manifest records per-file geometry counts, bounds, byte lengths and SHA-256 hashes. Positions/normals are floats, UVs normalized 16-bit integers, vertex colours normalized RGBA bytes; index buffers use 16-bit where possible. Standard glTF 2.0 only, no required extensions or extra runtime dependencies. Textures are base-colour only; small surface details are atlas artwork and modelled trim, without normal/roughness maps or baked lightmaps.

## Review and reproduce

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5189 --strictPort
```

Open `http://127.0.0.1:5189/tools/environment-preview.html` to orbit all ten assets. This page is outside the production build. Use the game root URL for the actual camera, court lighting and fog. The standalone gallery uses neutral review lighting, so it is not a game-colour reference.

```sh
python tools/generate_environment.py
npm run typecheck
npm test
npm run build
# Optional isolated validation tools, not application dependencies:
npm install --prefix .validation --no-save playwright-core gltf-validator
node tools/validate-environment.mjs
node tools/check-environment-browser.mjs gallery
node tools/check-environment-browser.mjs game
```

Browser scripts accept `CHROMIUM` and `URL` environment variables; their default Chrome path is Windows-specific. Start the dev server first. Reports and screenshots go to ignored `environment-shots/`. Gallery checks assert model triangles, one draw call plus the review floor, texture decoding and no page errors. Game checks assert the selected GLB request, a live canvas, no page errors/overflow at three emulated screen sizes, plus usable fallback when the environment request is aborted. These smoke checks do not establish frame rate, complete animation correctness or all UI layouts.

## Validation record and limitations

- Khronos glTF validator: all ten files, zero errors, zero warnings and zero informational messages.
- TypeScript / production build: passed. Existing 59 tests plus eight asset safety/budget tests: 67 passed.
- Browser evidence and final visual review are recorded in `ENVIRONMENT_VALIDATION.md`.
- Exact reference-image similarity, real Android/iPhone performance, GPU memory on devices, sustained frame pacing, cellular loading, accessibility and safe-area behaviour have not been established by these checks.
- No Cloudflare deployment was run for this branch. Main has an existing deployment workflow; merging and pushing main can start production deployment. No secrets, Cloudflare projects or hosting settings were changed.

Source: `tools/generate_environment.py`. Assets: `public/models/environment/`. Cursor merge/deploy handoff: `CURSOR_ENVIRONMENT_HANDOFF.md`.
