/** Multiplier earned by a clean-touch streak. The touch that reaches the mark earns it. */
export function streakMultiplier(cleanTouches: number): 1 | 2 | 3 | 4 {
  if (cleanTouches >= 50) return 4;
  if (cleanTouches >= 25) return 3;
  if (cleanTouches >= 10) return 2;
  return 1;
}
