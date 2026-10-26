/** Shared, mutable visual-feedback state written by event listeners and read per-frame (no React re-renders). */
export const fx = {
  /** Camera kick (0..1), decays each frame. */
  shake: 0,
  /** Crowd flash (0..1) at a milestone. */
  flash: 0,
  /** Set to 1 to spawn one confetti burst. Effects clears it. */
  confetti: 0,
};
