# Kickolé Brazilian environment kit

Original procedural geometry and texture artwork made for IQ Apps Group. No downloaded models, photographic textures, logos from other clubs, or external runtime assets. See `docs/BRAZILIAN_ENVIRONMENT.md` for integration, measured budgets and limitations. This kit does not alter the licence of the existing character or third-party dependencies.

All ten GLBs contain their own 1024 × 1024 PNG atlas and work without companion files or compression decoders. The separate `street-atlas.png` is provided for editing. Each GLB has one static mesh, one material, vertex tint and one draw call. PBR base colour, roughness 0.85, metallic 0; opaque, outward-facing geometry. No collision meshes, lights, animations, rigs or physics.

| File | Use |
| --- | --- |
| `hillside-lod0.glb` | High quality assembled neighbourhood |
| `hillside-lod1.glb` | Medium quality assembled neighbourhood |
| `hillside-lod2.glb` | Low quality assembled neighbourhood |
| `townhouse-ochre.glb` | Ochre house, balcony, shutters, rooftop equipment |
| `townhouse-coral.glb` | Coral house, clay pitched roof and chimney |
| `townhouse-teal.glb` | Teal house and balcony |
| `corner-mercearia.glb` | Grocery shop, signage, awning, produce and planter |
| `stepped-alley.glb` | 18-step alley, side walls, handrails and planters |
| `rooftop-equipment.glb` | Water tank, base, pipework, solar panel and TV aerial |
| `street-furniture.glb` | Slatted bench, bin, street lamp and planter |

Coordinates: **metres, +Y up, +Z facade/front**. Individual buildings and props have ground-level origins; the rooftop kit's origin is its mounting surface. The hillside's origin is court/street ground and its geometry sits behind negative Z. It includes 30 houses/shop and an alley. Its framing in the game is scaled separately; do not apply the game transform to standalone props.

These are baked scene modules: components within a file cannot be individually moved without editing the generator. Use the generator functions to export additional pieces or make layout variants. Only the three complete backdrops have LOD alternatives; the seven standalone modules are their full-detail versions.

Regenerate from repository root: `python tools/generate_environment.py` (Python 3.10+ and Pillow 12.3.0 used). Same environment and seed reproduce the manifest SHA-256 values. The generated atlas may vary across Pillow/font versions. Embedded PNGs, packed UVs and colours, and indexed geometry keep delivery portable. No Draco, Meshopt or KTX2 decoder is needed.
