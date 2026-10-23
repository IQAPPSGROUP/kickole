import { describe, expect, it } from 'vitest';
import { crowdLevel, loudestCheer, milestoneHits, type AudioProgress } from './audioPolicy';

const emptyProgress = (): AudioProgress => ({ streak: 0, kickUps: 0, perfects: 0 });

describe('audio milestones and crowd', () => {
  it('swells the crowd with the streak and stays inside 0..1', () => {
    expect(crowdLevel(0)).toBeGreaterThan(0.2);
    expect(crowdLevel(0)).toBeLessThan(crowdLevel(10));
    expect(crowdLevel(10)).toBeLessThan(crowdLevel(40));
    expect(crowdLevel(200)).toBeLessThanOrEqual(1);
    expect(crowdLevel(-4)).toBe(crowdLevel(0));
  });

  it('cheers each combo, juggle and perfect milestone once', () => {
    const start = emptyProgress();
    expect(milestoneHits(start, { streak: 9, kickUps: 9, perfects: 9 })).toEqual([]);
    expect(milestoneHits(start, { streak: 10, kickUps: 10, perfects: 1 })).toEqual(['streak:10', 'juggle:10']);
    expect(milestoneHits({ streak: 10, kickUps: 10, perfects: 9 }, { streak: 11, kickUps: 12, perfects: 10 })).toEqual(['perfect:10']);
    expect(milestoneHits({ streak: 9, kickUps: 24, perfects: 0 }, { streak: 50, kickUps: 26, perfects: 0 })).toEqual([
      'streak:10', 'streak:25', 'streak:50', 'juggle:25',
    ]);
  });

  it('keeps a single cheer when several moments land together', () => {
    expect(loudestCheer([])).toBeNull();
    expect(loudestCheer(['streak:10', 'juggle:10'])).toBe('streak:10');
    expect(loudestCheer(['perfect:10', 'streak:50', 'best'])).toBe('best');
    expect(loudestCheer(['streak:50', 'juggle:100'])).toBe('streak:50');
  });
});
