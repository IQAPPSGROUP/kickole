import { describe, expect, it } from 'vitest';
import { acceptSongTap } from './songTap';

describe('song pill taps', () => {
  it('counts every pointer tap and ignores the click from the same gesture', () => {
    expect(acceptSongTap('pointer', 0)).toBe(true);
    expect(acceptSongTap('pointer', 10)).toBe(true);
    expect(acceptSongTap('click', 40)).toBe(false);
    expect(acceptSongTap('click', 700)).toBe(false);
    expect(acceptSongTap('click', 701)).toBe(true);
  });
});
