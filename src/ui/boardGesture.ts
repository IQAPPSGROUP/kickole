/** Marks the leaderboard sheet so court gestures can leave it alone. */
export const BOARD_SHEET_SELECTOR = '[data-board-sheet]';

/**
 * A pointer on the court kicks. A pointer on the leaderboard, the rank panel,
 * a menu, or the song and pause controls must not. The song chip used to fall
 * through this capture listener, so WKWebView spent the tap on the court and
 * the button's click never ran.
 */
function closest(target: EventTarget | null, selector: string): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (element == null || typeof element.closest !== 'function') return false;
  return element.closest(selector) != null;
}

export function pointerOpensTheCourt(target: EventTarget | null): boolean {
  if (closest(target, BOARD_SHEET_SELECTOR)) return false;
  if (closest(target, '.world-rank')) return false;
  if (closest(target, '.screen')) return false;
  if (closest(target, '.screen-modal')) return false;
  if (closest(target, '.now-playing')) return false;
  if (closest(target, '.pause-btn')) return false;
  if (closest(target, '.music-debug')) return false;
  if (closest(target, '.music-debug-unlock')) return false;
  return true;
}
