/** How long a lost WebGL context may stay blank before the reload screen. */
export const CONTEXT_RESTORE_WAIT_MS = 2000;

/**
 * The canvas stays mounted after `webglcontextlost` (the event is cancelled)
 * so `webglcontextrestored` can rebuild it. The reload screen appears only
 * when that restore does not arrive.
 */
export function contextLostNeedsReload(lostAt: number | null, now: number, waitMs = CONTEXT_RESTORE_WAIT_MS): boolean {
  return lostAt != null && now - lostAt >= waitMs;
}
