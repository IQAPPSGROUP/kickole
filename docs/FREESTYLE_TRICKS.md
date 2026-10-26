# Freestyle tricks

Simulation-first freestyle foundation on `feature/freestyle-tricks`, driven by `GameEngine` with the Quaternius v2 character (`kickole_player_v2.glb`) posed procedurally.

## Controls

| Control | Action |
| --- | --- |
| LEFT / RIGHT | Classic foot juggling (unchanged when no trick is armed) |
| HEAD | Timed header while the ball descends near the forehead |
| NECK | Press-and-hold neck stall; release to flick out |
| ATW | Arms the next foot tap: pop → full revolution → timed return |
| THIGH | Arms the next foot tap for a thigh cushion |
| FLICK | Arms the next foot tap for a high flick (apex from gravity) |

Keyboard: `A`/`D` feet · `H` header · `N` neck (hold) · `W` ATW · `T` thigh · `F` flick · `Esc` cancel.

## Scoring (defaults)

| Event | Bonus |
| --- | --- |
| Header | +3 |
| Thigh | +2 |
| Neck stall catch | +10 |
| Around-the-world complete | +20 |
| High flick | no extra trick bonus (normal kick score only) |
| Variety combo | +5 once per completed chain |

## Variety combinations

Only **successful** scored engine events advance a chain. Attempts, misses, failed returns, held repeats and replayed tokens never award.

| Chain | Steps |
| --- | --- |
| FLICK → HEADER | high flick success, then header success |
| HEADER → NECK → RELEASE | header, neck catch, controlled release |
| STALL → ATW | foot stall success, then ATW return success |
| FOOT ↔ THIGH | alternating successful foot and thigh touches |

Progress expires after `tricks.comboExpirySec` (default 3.5 s). Miss, drop, failed trick and run restart clear progress.

## Contact targets

Logical ball-centre contacts (radius baked into authored heights) live in `config.contacts`: foot, thigh, forehead, nape. Rendering uses `limbCalibration.ts` for visual IK only — physics and scores stay simulation-authoritative.

## Review

`tools/movement-preview.tsx` stages success/fail/pause scenarios for each trick (both sides where relevant). Prefer joint/contact measurements over label-only checks.

See [FREESTYLE_VALIDATION.md](./FREESTYLE_VALIDATION.md) for automated vs staged vs physical-device results.

## Validation notes

- Automated: `npm run typecheck`, `npm test`, `VITE_ENVIRONMENT_THEME=beach npm run build`.
- Staged captures from the movement preview are not real-device timing proof.
- Physical iPhone/Android frame pacing and touch latency remain a separate check.
