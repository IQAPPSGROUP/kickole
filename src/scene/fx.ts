/** Shared, mutable visual-feedback state written by event listeners and read per-frame (no React re-renders). */
export const fx = {
  /** Camera kick (0..1), decays each frame. */
  shake: 0,
  push: 0,
  slowMotion: 0,
};
