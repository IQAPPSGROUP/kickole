import { describe, expect, it } from 'vitest';
import { CONTEXT_RESTORE_WAIT_MS, contextLostNeedsReload } from './glRecovery';

describe('WebGL context restore', () => {
  it('keeps the canvas up until the restore wait has passed', () => {
    expect(contextLostNeedsReload(null, 5_000)).toBe(false);
    const lostAt = 10_000;
    expect(contextLostNeedsReload(lostAt, lostAt + CONTEXT_RESTORE_WAIT_MS - 1)).toBe(false);
    expect(contextLostNeedsReload(lostAt, lostAt + CONTEXT_RESTORE_WAIT_MS)).toBe(true);
  });
});
