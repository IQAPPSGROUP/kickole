# Freestyle tricks — validation

Evidence layers are separated so a label change or celebration alone never counts as a completed trick.

## 1. Automated gameplay checks (authoritative)

Command results on `feature/freestyle-tricks` (local worktree):

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 131 tests / 15 files |
| `VITE_ENVIRONMENT_THEME=beach npm run build` | Pass |

Covered by tests (engine + pose measurements, not UI labels):

- Header / neck / ATW / thigh / high flick success and failure paths (`tricks.test.ts`)
- Both-side ATW foot revolution, clearance and timed return
- Max gravity high flick still clears forehead height
- Rapid / conflicting input, cancel, restart, frame-rate independent stepping
- Combo tracker: flick→header, header→neck→release, stall→ATW, foot↔thigh; expiry; replay token ignore; mistimed header after flick awards nothing (`combos.test.ts`)
- Opening camera endpoint matches gameplay framing (`openingCamera.test.ts`)
- Pose lock + joint angles for header / neck / ATW / thigh (`trickPose.test.ts`) using `V2_LIMBS` calibration
- Asset presence for beach/street/glb + storage save round-trips

## 2. Staged captures (movement preview)

Source: `tools/movement-preview.tsx` scenarios (`headerOk` / `headerFail` / `neckHold` / `neckRelease` / `atwLeft` / `atwRight` / `atwFail` / `thighLeft` / `thighRight` / `flickLeft` / `flickRight`).

These are **posed replays** for visual review of contact surfaces and limb arcs. They do **not** prove timing windows or touch latency.

Review stills (committed under `docs/images/`):

| Artifact | Notes |
| --- | --- |
| `docs/images/freestyle-{headerOk,headerFail,neckHold,neckRelease,atwLeft,atwRight,atwFail,thighLeft,thighRight,flickLeft,flickRight}.png` | Staged movement-preview poses — not device timing proof |
| `docs/images/freestyle-ui-{375x667,390x844,430x932}.png` | Narrow portrait game shell with trick bar (software GL) |
| `docs/images/freestyle-gameplay-beach.png` | Live beach gameplay shell after play start |
| `docs/freestyle-validation.json` | Joint/pose samples from staged captures |

## 3. Physical-device results

| Device / viewport | Status |
| --- | --- |
| iPhone 375×667 / 390×844 / 430×932 (CSS + camera framing) | Layout/CSS tightened for narrow portrait; camera framing includes high-flick apex in math check |
| Real touch / frame pacing on physical iPhone/Android | **Not run in this agent session** — remains a manual QA gap |

## 4. Graphics / environments

| Case | Status |
| --- | --- |
| Primitive fallback character | Unchanged path via `CharacterSwitch` |
| Low / Medium / High quality | Unchanged settings + canvas remount |
| Beach (`VITE_ENVIRONMENT_THEME=beach`) | Production build OK |
| Street (default theme) | Unchanged assets |
| Opening pan settles once; no replay on tricks / home / quality | Integrated from opening-scene-pan stash |

## 5. Remaining limitations

- Physical multi-touch and 60/120 Hz device pacing not verified here.
- Header → neck in live play still requires the ball to re-enter the nape band after the soft header redirect (combo expiry 3.5 s).
- Variety bonus is once per completed chain; overlapping progress across different chain IDs can coexist until expiry.
