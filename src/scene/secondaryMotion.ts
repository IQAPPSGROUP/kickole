const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Written each frame so hair meshes parented to the head can lag behind it. */
export const hairSpring = { pitch: 0, yaw: 0, roll: 0 };

export interface SecondarySample {
  hairPitch: number;
  hairYaw: number;
  kitPitch: number;
  kitRoll: number;
}

export interface SecondaryDrive {
  headYaw: number;
  headPitch: number;
  torsoRoll: number;
  torsoPitch: number;
}

/**
 * Critically damped lag for hair and the shirt.
 * A fast head turn leaves the hair behind; a hip sway leaves the kit behind.
 * Settles to zero when the drive holds still.
 */
export function createSecondaryMotion() {
  const sample: SecondarySample = { hairPitch: 0, hairYaw: 0, kitPitch: 0, kitRoll: 0 };
  let prev: SecondaryDrive = { headYaw: 0, headPitch: 0, torsoRoll: 0, torsoPitch: 0 };
  let primed = false;

  const follow = (current: number, target: number, dt: number, tau: number) =>
    current + (target - current) * (1 - Math.exp(-dt / tau));

  return {
    reset() {
      sample.hairPitch = sample.hairYaw = sample.kitPitch = sample.kitRoll = 0;
      hairSpring.pitch = hairSpring.yaw = hairSpring.roll = 0;
      primed = false;
    },
    step(dt: number, drive: SecondaryDrive, reduced: boolean): SecondarySample {
      const stepDt = clamp(dt, 1 / 120, 1 / 20);
      const amp = reduced ? 0.25 : 1;
      if (!primed) {
        prev = { ...drive };
        primed = true;
        return sample;
      }
      const yawV = (drive.headYaw - prev.headYaw) / stepDt;
      const pitchV = (drive.headPitch - prev.headPitch) / stepDt;
      const rollV = (drive.torsoRoll - prev.torsoRoll) / stepDt;
      const torsoV = (drive.torsoPitch - prev.torsoPitch) / stepDt;
      prev = { ...drive };
      sample.hairYaw = follow(sample.hairYaw, clamp(-yawV * 0.05, -0.2, 0.2) * amp, stepDt, 0.14);
      sample.hairPitch = follow(sample.hairPitch, clamp(-pitchV * 0.04, -0.14, 0.14) * amp, stepDt, 0.14);
      sample.kitRoll = follow(sample.kitRoll, clamp(-rollV * 0.06, -0.12, 0.12) * amp, stepDt, 0.16);
      sample.kitPitch = follow(sample.kitPitch, clamp(-torsoV * 0.045, -0.1, 0.1) * amp, stepDt, 0.16);
      hairSpring.pitch = sample.hairPitch;
      hairSpring.yaw = sample.hairYaw;
      hairSpring.roll = sample.kitRoll * 0.35;
      return sample;
    },
  };
}
