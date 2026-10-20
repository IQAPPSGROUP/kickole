import { describe, expect, it } from 'vitest';
import { GAMEPLAY_BPM, MENU_BPM } from './beat';
import {
  INTRO_BARS,
  bassEvent,
  chordNotes,
  hatLevel,
  kitHits,
  planStep,
  swingDelay,
} from './musicBed';

function count(start: number, mode: 'menu' | 'play', hit: 'kick' | 'snare'): number {
  let n = 0;
  for (let i = 0; i < 16; i++) if (kitHits(start + i, mode)[hit]) n += 1;
  return n;
}

describe('boom-bap bed', () => {
  const loop = INTRO_BARS * 16;

  it('keeps both beds inside the street tempo range', () => {
    expect(GAMEPLAY_BPM).toBeGreaterThanOrEqual(88);
    expect(GAMEPLAY_BPM).toBeLessThanOrEqual(95);
    expect(MENU_BPM).toBeGreaterThanOrEqual(88);
    expect(MENU_BPM).toBeLessThanOrEqual(95);
    expect(MENU_BPM).not.toBe(GAMEPLAY_BPM);
  });

  it('swings the off-sixteenth and leaves downbeats on the grid', () => {
    const step = 0.2;
    expect(swingDelay(0, step, 'play')).toBe(0);
    expect(swingDelay(2, step, 'play')).toBe(0);
    expect(swingDelay(1, step, 'play')).toBeCloseTo(0.24 * step, 5);
    expect(swingDelay(1, step, 'menu')).toBeCloseTo(0.1 * step, 5);
    expect(swingDelay(1, step, 'menu')).toBeLessThan(swingDelay(1, step, 'play'));
  });

  it('opens with an intro, then A and B, and fills each 8-bar half', () => {
    expect(planStep(0).section).toBe('intro');
    expect(planStep(0).fill).toBe(false);
    expect(planStep(loop).section).toBe('A');
    expect(planStep(loop + 7 * 16).fill).toBe(true);
    expect(planStep(loop + 7 * 16).section).toBe('A');
    expect(planStep(loop + 8 * 16).section).toBe('B');
    expect(planStep(loop + 8 * 16).fill).toBe(false);
    expect(planStep(loop + 15 * 16).fill).toBe(true);
    expect(planStep(loop + 15 * 16).section).toBe('B');
    expect(planStep(loop + 16 * 16).section).toBe('A');
  });

  it('varies hat velocity and drops ghost sixteenths on the menu', () => {
    expect(hatLevel(loop, 'play')).toBeGreaterThan(hatLevel(loop + 1, 'play'));
    expect(hatLevel(loop + 1, 'menu')).toBe(0);
    expect(hatLevel(loop, 'menu')).toBeGreaterThan(0);
    const levels = new Set<number>();
    for (let i = 0; i < 16; i++) {
      const level = hatLevel(loop + i, 'play');
      if (level > 0) levels.add(Math.round(level * 100));
    }
    expect(levels.size).toBeGreaterThan(4);
  });

  it('gives the menu a thinner kit and a different chord', () => {
    expect(count(loop, 'play', 'kick')).toBeGreaterThan(count(loop, 'menu', 'kick'));
    expect(count(loop + 7 * 16, 'play', 'snare')).toBeGreaterThan(count(loop, 'play', 'snare'));
    expect(count(loop + 7 * 16, 'menu', 'snare')).toBeGreaterThan(count(loop, 'menu', 'snare'));
    const play = chordNotes(loop, 'play');
    const menu = chordNotes(loop, 'menu');
    expect(play).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(play).not.toEqual(menu);
    expect((play ?? []).length).toBeGreaterThan((menu ?? []).length);
    expect(chordNotes(loop, 'play')).not.toEqual(chordNotes(loop + 8 * 16, 'play'));
    expect(bassEvent(0, 'play')).toBeNull();
    expect(bassEvent(loop, 'play')?.freq).not.toBe(bassEvent(loop, 'menu')?.freq);
  });
});
