import { describe, expect, it } from 'vitest';
import { WORLD_RIVALS, sanitizeNickname, worldBoard } from './board';

describe('world board', () => {
  it('sanitizes nicknames', () => {
    expect(sanitizeNickname('  Ana\nB  ')).toBe('AnaB');
    expect(sanitizeNickname('')).toBe('Kicky');
    expect(sanitizeNickname('   ')).toBe('Kicky');
    expect(sanitizeNickname('123456789012345')).toBe('123456789012');
    expect(sanitizeNickname('Rio\u0007Kid')).toBe('RioKid');
  });

  it('climbs when the score passes rivals and stays below a tie', () => {
    const low = worldBoard('Rio', 0);
    expect(low.rank).toBe(WORLD_RIVALS.length);
    expect(low.rows[low.rank].nickname).toBe('Rio');
    const climbed = worldBoard('Rio', 60);
    expect(climbed.rank).toBe(low.rank - 2);
    expect(climbed.rows[climbed.rank].score).toBe(60);
    expect(climbed.rows[climbed.rank - 1].score).toBeGreaterThan(60);
    const tied = worldBoard('Rio', 55);
    expect(tied.rows[tied.rank - 1].score).toBe(55);
    expect(tied.rows[tied.rank - 1].you).toBe(false);
  });
});
