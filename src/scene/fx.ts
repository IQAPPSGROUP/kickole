/** Shared, mutable visual-feedback state written by event listeners and read per-frame (no React re-renders). */
export const fx = {
  /** Camera kick (0..1), decays each frame. */
  shake: 0,
  push: 0,
  /** Slow celebration orbit (0..1). */
  celebrate: 0,
  /** Signed yaw bias toward the last kicking foot. */
  sway: 0,
  /** Kick-up milestone dolly (0..1). */
  pulse: 0,
  /** Increments when a milestone should throw extra particles. Low quality leaves this alone. */
  milestoneBurst: 0,
  /** Sideline cheer (0..1). Spectators hop while this is up. */
  cheer: 0,
  /** Sun shower / street-lamp flicker (0..1). */
  shower: 0,
  /** Scene clock the decorative beach ball is sampled from. */
  propTime: 0,
  /** Bounce-loop index currently popped, or -1. */
  beachPop: -1,
};
