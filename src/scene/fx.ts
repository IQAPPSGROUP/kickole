/** Shared, mutable visual-feedback state written by event listeners and read per-frame (no React re-renders). */
export const fx = {
  /** Camera kick (0..1), decays each frame. */
  shake: 0,
  push: 0,
  /** Slow celebration orbit (0..1). */
  celebrate: 0,
  /** Signed yaw bias toward the last kicking foot. */
  sway: 0,
};
