/** Marks the leaderboard sheet so court gestures can leave it alone. */
export const BOARD_SHEET_SELECTOR = '[data-board-sheet]';

/**
 * A pointer on the court kicks. A pointer on the leaderboard, the pre-run
 * board, or a menu must not, or WKWebView never receives the scroll.
 */
function closest(target: EventTarget | null, selector: string): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (element == null || typeof element.closest !== 'function') return false;
  return element.closest(selector) != null;
}

export function pointerOpensTheCourt(target: EventTarget | null): boolean {
  if (closest(target, BOARD_SHEET_SELECTOR)) return false;
  if (closest(target, '.run-lineup-hit')) return false;
  if (closest(target, '.screen')) return false;
  if (closest(target, '.screen-modal')) return false;
  return true;
}
