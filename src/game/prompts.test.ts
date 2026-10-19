import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_GAP_SEC,
  LESSONS,
  REPEAT_TIP,
  applyPromptAction,
  beginRun,
  freshClock,
  lessonById,
  nextLesson,
  normalizeLearned,
  tickPrompts,
} from './prompts';

describe('trick prompts and tutorials', () => {
  it('teaches each trick once, in order, and remembers it', () => {
    let clock = tickPrompts(beginRun([], true), 0, 0);
    expect(clock.active?.call).toBe('Head it!');
    expect(clock.active?.tutorial).toBe(true);
    for (const lesson of LESSONS) {
      expect(clock.active?.id).toBe(lesson.id);
      const now = clock.active?.startedAt ?? 0;
      const beat = lesson.id === 'groove' ? 'perfect' as const : null;
      const steps = lesson.chainNeed;
      let result = applyPromptAction(clock, lesson.id === 'chain' ? 'header' : lesson.id, now + 0.2, beat);
      for (let i = 1; i < steps; i++) {
        result = applyPromptAction(result.clock, i % 2 === 0 ? 'thigh' : 'rainbow', now + 0.3 + i, null);
      }
      expect(result.bonus).toBe(lesson.bonus);
      expect(result.cheer).toBe(true);
      expect(result.learned).toBe(lesson.id);
      expect(result.call).toBe(lesson.call);
      expect(result.clock.learned).toContain(lesson.id);
      clock = result.clock;
    }
    expect(nextLesson(clock.learned)).toBeNull();
  });

  it('pays the rainbow and on-beat groove bonuses and refuses an off-beat groove', () => {
    const rainbow = lessonById('rainbow');
    let clock = tickPrompts(beginRun(['header', 'thigh', 'neck', 'flick'], true), 1, 0);
    expect(clock.active?.call).toBe('Hit a Rainbow!');
    const hit = applyPromptAction(clock, 'rainbow', 1.2, null);
    expect(hit.bonus).toBe(rainbow.bonus);
    expect(hit.cheer).toBe(true);
    clock = tickPrompts(hit.clock, hit.clock.active?.startedAt ?? 2, 0);
    expect(clock.active?.call).toBe('Groove on the beat!');
    const early = applyPromptAction(clock, 'groove', 2, 'off');
    expect(early.bonus).toBe(0);
    expect(early.clock.active?.id).toBe('groove');
    expect(early.clock.tip).toMatch(/beat/i);
    const late = applyPromptAction(early.clock, 'groove', 2.4, 'good');
    expect(late.bonus).toBe(lessonById('groove').bonus);
    expect(late.cheer).toBe(true);
    expect(late.clock.learned).toEqual(['header', 'thigh', 'neck', 'flick', 'rainbow', 'groove']);
  });

  it('needs three tricks for a chain and resets the count on a plain kick', () => {
    let clock = tickPrompts(beginRun(LESSONS.slice(0, 6).map((lesson) => lesson.id), true), 0, 0);
    expect(clock.active?.call).toBe('Chain 3 tricks!');
    const first = applyPromptAction(clock, 'header', 0.2, null);
    expect(first.bonus).toBe(0);
    expect(first.clock.active?.chainCount).toBe(1);
    const broken = applyPromptAction(first.clock, 'kick', 0.4, null);
    expect(broken.clock.active?.chainCount).toBe(0);
    const a = applyPromptAction(broken.clock, 'thigh', 0.6, null);
    const b = applyPromptAction(a.clock, 'rainbow', 0.8, null);
    const c = applyPromptAction(b.clock, 'groove', 1, 'perfect');
    expect(c.bonus).toBe(12);
    expect(c.cheer).toBe(true);
    expect(c.clock.learned).toContain('chain');
  });

  it('keeps the prompt up and shows a tip when the player misses', () => {
    const clock = tickPrompts(beginRun([], true), 0, 0);
    const missed = applyPromptAction(clock, 'miss', 1, null);
    expect(missed.bonus).toBe(0);
    expect(missed.clock.active?.id).toBe('header');
    expect(missed.clock.tip).toMatch(/HEAD/);
  });

  it('retries a tutorial prompt when the window runs out', () => {
    const clock = tickPrompts(beginRun([], true), 0, 0);
    const expired = tickPrompts(clock, clock.expiresAt + 0.01, 0);
    expect(expired.active?.id).toBe('header');
    expect(expired.active?.startedAt).toBeGreaterThan(0);
    expect(expired.tip).toMatch(/HEAD/);
  });

  it('offers a challenge only after every lesson is learned', () => {
    const learned = LESSONS.map((lesson) => lesson.id);
    const waiting = beginRun(learned, true);
    expect(waiting.active).toBeNull();
    const early = tickPrompts(waiting, CHALLENGE_GAP_SEC - 0.1, 2);
    expect(early.active).toBeNull();
    const due = tickPrompts(waiting, CHALLENGE_GAP_SEC, 2);
    expect(due.active?.tutorial).toBe(false);
    expect(due.active?.id).toBe(LESSONS[2]?.id);
    const done = applyPromptAction(due, due.active!.id === 'chain' ? 'header' : due.active!.id, CHALLENGE_GAP_SEC + 0.2, 'perfect');
    if (due.active?.chainNeed === 1) {
      expect(done.bonus).toBeGreaterThan(0);
      expect(done.learned).toBeNull();
      expect(done.clock.learned).toEqual(learned);
    }
  });

  it('nudges a repeated trick and stays quiet when hints are off', () => {
    let clock = freshClock(LESSONS.map((lesson) => lesson.id), true);
    clock = { ...clock, nextAt: 50 };
    let result = applyPromptAction(clock, 'header', 1, null);
    result = applyPromptAction(result.clock, 'header', 2, null);
    result = applyPromptAction(result.clock, 'header', 3, null);
    expect(result.clock.tip).toBe(REPEAT_TIP);
    const quiet = beginRun([], false);
    expect(tickPrompts(quiet, 40, 1).active).toBeNull();
    expect(applyPromptAction(quiet, 'rainbow', 1, null).bonus).toBe(0);
    expect(applyPromptAction(quiet, 'rainbow', 1, null).clock.learned).toEqual([]);
  });

  it('drops forged lesson ids and keeps the first copy', () => {
    expect(normalizeLearned(['groove', 'nope', 'groove', 3, 'rainbow'])).toEqual(['groove', 'rainbow']);
    expect(normalizeLearned(null)).toEqual([]);
  });
});
