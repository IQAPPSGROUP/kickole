# Kickolé Brazilian beach environment

Original geometry and texture artwork created for IQ Apps Group. No downloaded models, photographic textures or external runtime resources. This kit does not relicense the older character or dependencies.

Ten self-contained glTF 2.0 binary assets, each with one opaque PBR material, one embedded 1024² PNG atlas, vertex tint and one draw call. No compression extensions, colliders, animation clips, lights or physics. Ocean, foam and palm leaves are static geometry/textures. No transparent water shader or wind simulation.

| File | Contents |
| --- | --- |
| `beach-lod0.glb` | Full beach backdrop, High quality |
| `beach-lod1.glb` | Simplified beach backdrop, Medium quality |
| `beach-lod2.glb` | Reduced beach backdrop, Low quality |
| `palm-cluster.glb` | Two curved palms, layered fronds/leaflets and coconuts |
| `coconut-kiosk.glb` | Thatched refreshment kiosk, sign, stools, cooler and coconuts |
| `lifeguard-tower.glb` | Raised tower, ladder, railing, lifebuoy and safety flag |
| `umbrella-loungers.glb` | Paneled umbrella, two framed loungers, table and coconut drink |
| `beach-goal.glb` | Goal frame, side supports and modeled net |
| `fishing-boat.glb` | Painted hull, recessed deck, seats, oars, motor and rope |
| `boardwalk.glb` | Plank walkway, rope rails and litter bin |

Metres, **+Y up, +Z front**. All standalone modules are at ground level; the boat includes a shallow keel and is intended to sit on sand or be lowered to a waterline. The assembled backdrop uses absolute placement behind `z=-4.4`, leaving the player/court area clear. Its origin is the same ground coordinate as the game. Beach court sand and boundary ropes are rendered separately in `BeachCourt.tsx`.

Only the three assembled backdrops have LOD alternatives. The seven standalone modules are full-detail baked meshes. Individual subparts can be changed/re-exported using generator functions, rather than repositioned as separate nodes inside these merged GLBs. The separate `beach-atlas.png` is for editing; GLBs do not require it alongside them.

Generate: `python tools/generate_beach.py` (Python 3.12.14 and Pillow 12.3.0 used). This imports the shared mesh/GLB writer from `tools/generate_environment.py`; keep both files. It does not regenerate street assets. Manifest includes bounds, triangle counts, bytes and SHA-256 hashes. Atlas/font output can vary with Pillow versions.

Review: run the dev server, then open `/tools/environment-preview.html?theme=beach`. Play the dev theme at `/?environment=beach`. For a production beach build set `VITE_ENVIRONMENT_THEME=beach`; without it, the existing street remains default. See `docs/BRAZILIAN_BEACH.md` and `docs/CURSOR_BEACH_HANDOFF.md`.
