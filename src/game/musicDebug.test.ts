import { describe, expect, it } from 'vitest';
import {
  MUSIC_DEBUG_TAP_COUNT,
  MUSIC_DEBUG_TAP_GAP_MS,
  musicDebugRequested,
  nextMusicDebugTaps,
} from './musicDebug';

describe('music debug reveal', () => {
  it('opens from a debug query and stays closed otherwise', () => {
    expect(musicDebugRequested('')).toBe(false);
    expect(musicDebugRequested('?tier=low')).toBe(false);
    expect(musicDebugRequested('?debug')).toBe(true);
    expect(musicDebugRequested('musicdebug=1')).toBe(true);
  });

  it('counts five quick taps and restarts after a gap', () => {
    let count = 0;
    for (let i = 0; i < MUSIC_DEBUG_TAP_COUNT - 1; i++) count = nextMusicDebugTaps(count, 100);
    expect(count).toBe(4);
    expect(nextMusicDebugTaps(count, MUSIC_DEBUG_TAP_GAP_MS)).toBe(MUSIC_DEBUG_TAP_COUNT);
    expect(nextMusicDebugTaps(4, MUSIC_DEBUG_TAP_GAP_MS + 1)).toBe(1);
  });
});
