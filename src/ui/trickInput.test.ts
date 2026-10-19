import { describe, expect, it } from 'vitest';
import { classifyTrickRelease } from './trickInput';

describe('trick button release', () => {
  it('fires on a tap during play and ignores a drag', () => {
    expect(classifyTrickRelease({ phase: 'playing', dx: 2, dy: -4 })).toBe('fire');
    expect(classifyTrickRelease({ phase: 'playing', dx: 40, dy: 0 })).toBe('ignore');
  });

  it('reports locked before the first kick', () => {
    expect(classifyTrickRelease({ phase: 'ready', dx: 0, dy: 0 })).toBe('locked');
    expect(classifyTrickRelease({ phase: 'menu', dx: 1, dy: 1 })).toBe('locked');
  });
});
