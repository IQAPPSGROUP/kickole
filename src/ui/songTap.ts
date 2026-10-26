/**
 * One finger tap fires pointerup and, on iOS, a click afterwards.
 * The click is the same tap. A later tap, and a keyboard click, still count.
 */
export function acceptSongTap(source: 'pointer' | 'click', msSincePointer: number): boolean {
  if (source === 'pointer') return true;
  return msSincePointer > 700;
}
