import { describe, expect, it } from 'vitest';
import { isCheerMilestone, isKickMilestone, kickMilestonesUpTo, milestoneJustCrossed } from './milestones';

describe('kick-up milestones', () => {
  it('lists 5, 10, 15, 25, 50, then every 25', () => {
    expect(kickMilestonesUpTo(4)).toEqual([]);
    expect(kickMilestonesUpTo(50)).toEqual([5, 10, 15, 25, 50]);
    expect(kickMilestonesUpTo(100)).toEqual([5, 10, 15, 25, 50, 75, 100]);
    expect(isKickMilestone(15)).toBe(true);
    expect(isKickMilestone(30)).toBe(false);
    expect(isKickMilestone(75)).toBe(true);
    expect(isKickMilestone(0)).toBe(false);
  });

  it('reports the highest milestone just crossed, once', () => {
    expect(milestoneJustCrossed(4, 5)).toBe(5);
    expect(milestoneJustCrossed(5, 6)).toBeNull();
    expect(milestoneJustCrossed(9, 10)).toBe(10);
    expect(milestoneJustCrossed(14, 15)).toBe(15);
    expect(milestoneJustCrossed(24, 25)).toBe(25);
    expect(milestoneJustCrossed(49, 50)).toBe(50);
    expect(milestoneJustCrossed(50, 51)).toBeNull();
    expect(milestoneJustCrossed(74, 75)).toBe(75);
    expect(milestoneJustCrossed(99, 100)).toBe(100);
    expect(milestoneJustCrossed(48, 76)).toBe(75);
    expect(milestoneJustCrossed(5, 5)).toBeNull();
    expect(milestoneJustCrossed(10, 4)).toBeNull();
  });

  it('cheers only at 5, 10 and 25', () => {
    expect(isCheerMilestone(5)).toBe(true);
    expect(isCheerMilestone(10)).toBe(true);
    expect(isCheerMilestone(25)).toBe(true);
    expect(isCheerMilestone(15)).toBe(false);
    expect(isCheerMilestone(50)).toBe(false);
  });
});
