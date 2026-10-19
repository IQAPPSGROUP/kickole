# Brazilian beach-football graphics kit

Branch `graphics/brazilian-beach-environment` builds on street-kit commit `0ec29e8`. It carries that earlier work and adds one beach graphics commit. If the street branch has not been merged, merging this branch includes both kits. Existing street GLB/PNG files and their generation output remain unchanged.

## Appearance and scope

Six curved palms with modeled trunks/fronds/coconuts, a thatched coconut kiosk, elevated lifeguard tower, four umbrella/lounger sets, a netted beach goal, painted fishing boat, plank boardwalk, patterned Brazilian wave paving, dunes, driftwood, shells, static sea and layered foam. Seven standalone modules and three complete backdrop LODs. Original procedural art follows the existing warm teal/coral/ochre style. Original reference pictures remain unavailable; close picture matching is not established.

The optional beach court has sand ripples/grain, pale rope boundaries and a freestyle circle. Sky/fog are coastal blue. These are visual changes only: player/ball coordinates, camera behaviour, engine, physics, scoring, inputs, character rig/animations and UI remain unchanged. Props and goal have no colliders or goal-scoring behaviour. A graphics listener-lifetime fix prevents a disposed canvas from showing a false context-loss error when graphics quality changes; genuine loss of the current canvas still opens the recovery screen.

## Choosing the theme

- Default production build: **street**, preserving the prior scene.
- Production beach build: set `VITE_ENVIRONMENT_THEME=beach` **during the build**. This is not a runtime setting. `?environment=beach` cannot change production themes.
- Development beach game: `http://127.0.0.1:5189/?environment=beach`.
- Development orbit viewer: `http://127.0.0.1:5189/tools/environment-preview.html?theme=beach`.
- Existing `VITE_USE_GLB_ENVIRONMENT=false` selects simple built-in scenery for the active theme. Missing/invalid beach GLBs also fall back to an ocean/goal scene, leaving court/player rendering available.

No gameplay menu or level selection was added. The viewer is a development tool outside the production build. High → LOD0, Medium → LOD1, Low → LOD2; quality-selected static alternatives, not distance-switched LOD. Only the selected backdrop downloads. Standalone modules are not downloaded by gameplay. Cached LODs remain in memory after switching quality.

## Measured budgets

| Backdrop | Triangles | GLB bytes | Local gzip bytes |
| --- | ---: | ---: | ---: |
| High | 36,470 | 3,536,048 | 1,004,170 |
| Medium | 9,322 | 1,091,928 | 498,933 |
| Low | 5,094 | 758,928 | 437,208 |

One material and one draw per GLB. Seven standalone models range from 840 triangles (goal) to 7,416 (two-palm cluster). All atlas images are 1024² sRGB. Standard indexed glTF with float positions/normals, packed UVs/RGBA colour, embedded PNG; no required decoder or new application dependencies. The atlas is base colour only, with no normal/roughness maps. Water, foliage and foam are static; backdrop meshes do not cast additional shadows. Gzip values are local compression measurements, not measured Cloudflare transfer sizes.

## Regenerate and verify

```sh
python tools/generate_beach.py
npm run typecheck
npm test
npm run build
# Optional isolated review tools from the street kit:
npm install --prefix .validation --no-save playwright-core gltf-validator
node tools/validate-environment.mjs beach
```

Start `npm run dev -- --host 127.0.0.1 --port 5189 --strictPort`, then set `THEME=beach` in your shell and run `node tools/check-environment-browser.mjs gallery` and `node tools/check-environment-browser.mjs game`. The browser tool accepts `URL` and `CHROMIUM`. Output goes to ignored `beach-shots/`. On PowerShell use `$env:THEME='beach'`; likewise set `$env:VITE_ENVIRONMENT_THEME='beach'` before building a beach production bundle. Browser production checks use `node tools/check-environment-browser.mjs production` against `npm run preview`, with `THEME=beach` and `URL` set to that preview URL.

Validation and screenshots: `BEACH_VALIDATION.md`. Cursor merge/deploy instructions: `CURSOR_BEACH_HANDOFF.md`.

## Limits

No real-device frame rate, sustained play, safe areas, accessibility or cellular loading claim. Original picture similarity remains unverified. The game camera crops parts of tall/side scenery; the orbit viewer shows complete modules. No Cloudflare deployment was performed, no main push was made, no hosting project or secrets were changed.
