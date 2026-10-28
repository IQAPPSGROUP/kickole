# Kicky animated player integration

The model named below has been removed. Do not extract it. The game uses the Fab players.

This note used to say: extract `kicky-player-rigged.glb` from `kicky-player-animated-package.zip` into `public/models/kicky-player-rigged.glb`. That file is gone. `tools/generate_kicky_player.py` stops before it can write the file again.

This first-stage model is articulated (rigid body parts with animated joints), not a fully skinned humanoid mesh. Animation clips: `Idle`, `KickLeft`, `KickRight`, `Miss`, `Celebrate`.

## Integration acceptance criteria
- Inspect existing character loader and current game contracts first.
- Load the GLB from the public path; enumerate actual clips at runtime.
- Keep the procedural character as a fallback for missing/invalid assets.
- Connect kick animations to accepted kick events, not raw taps.
- The deterministic ball simulation is authoritative for contact and scoring.
- Synchronize contact visually; do not assume 0.30 s without inspecting the clip.
- Preserve score, timing, input controls, and mobile layout.
- Test idle/kick-left/kick-right/miss/celebrate transitions and reset.
- Check model orientation, scale, foot contact, shadows, and mobile performance.
- Run typecheck, unit tests and production build.
- Report what is verified vs. still untested on a real phone.

## Later
Replace rigid articulation with a skinned, deformable rig and add foot stall and Around the World. Maintain compatible shared skeleton and material slots for future cosmetic skins.
