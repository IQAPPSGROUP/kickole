/**
 * Limb lengths and contact offsets for the contract rig.
 * (Quaternius UE hierarchy). Simulation contact targets in `config.contacts`
 * stay authoritative; these values only calibrate visual IK / pose accents.
 */
export const V2_LIMBS = {
  /** Local thigh length (thigh → calf translation Y). */
  thigh: 0.429,
  /** Local calf length (calf → foot translation Y). */
  shin: 0.459,
  /** Approximate hip half-width from pelvis to thigh root. */
  hipX: 0.114,
  /** Pelvis world height in the rest bind (glTF Y-up after game facing). */
  pelvisY: 0.95,
  /** Forehead visual offset above Head bone (ball-centre contact sits higher). */
  foreheadAboveHead: 0.12,
  /** Upper-back / nape sit behind the neck pivot (negative local Z in game space). */
  napeBehindNeck: 0.14,
  /** Foot sole below Foot bone for clearance visuals. */
  soleBelowFoot: 0.06,
} as const;

/** Visual IK targets use the same ball-centre contacts as the engine, minus a surface offset. */
export function visualContactPoint(
  ballCentre: { x: number; y: number; z: number },
  towardBody: { x: number; y: number; z: number },
  ballRadius: number,
): { x: number; y: number; z: number } {
  const dx = towardBody.x - ballCentre.x;
  const dy = towardBody.y - ballCentre.y;
  const dz = towardBody.z - ballCentre.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const s = ballRadius / len;
  return {
    x: ballCentre.x + dx * s * 0.15,
    y: ballCentre.y - ballRadius * 0.55,
    z: ballCentre.z + dz * s * 0.15,
  };
}
