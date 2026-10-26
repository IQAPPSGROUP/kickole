import { describe, expect, it } from 'vitest';
import { nextRobAttempt } from './audio';

describe('song load retry', () => {
  it('retries setMode once after a miss, then falls back', () => {
    expect(nextRobAttempt(true, false)).toBe('ready');
    expect(nextRobAttempt(true, true)).toBe('ready');
    expect(nextRobAttempt(false, false)).toBe('retry');
    expect(nextRobAttempt(false, true)).toBe('fallback');
  });
});
