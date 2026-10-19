import { describe, expect, it, beforeEach } from 'vitest';
import {
  getOpeningIntroSnapshot,
  initOpeningIntro,
  resetOpeningIntroForTests,
  skipOpeningIntro,
  subscribeOpeningIntro,
} from './openingIntro';

describe('openingIntro snapshot stability', () => {
  beforeEach(() => {
    resetOpeningIntroForTests();
  });

  it('returns the same object reference between emits', () => {
    initOpeningIntro();
    const a = getOpeningIntroSnapshot();
    const b = getOpeningIntroSnapshot();
    expect(a).toBe(b);
  });

  it('notifies once when skipped to done', () => {
    initOpeningIntro();
    let n = 0;
    const unsub = subscribeOpeningIntro(() => { n += 1; });
    const before = getOpeningIntroSnapshot();
    skipOpeningIntro();
    const after = getOpeningIntroSnapshot();
    expect(after).not.toBe(before);
    expect(after.active).toBe(false);
    expect(after.phase).toBe('done');
    expect(n).toBe(1);
    unsub();
  });
});
