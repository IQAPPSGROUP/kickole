/**
 * Trick prompts, first-time lessons and repeat tips.
 * Cosmetic coaching only: it never changes contact windows.
 * Completion awards a flat bonus the controller adds to the score.
 */

export const LESSON_IDS = ['header', 'thigh', 'neck', 'flick', 'rainbow', 'groove', 'chain'] as const;
export type LessonId = (typeof LESSON_IDS)[number];

export type PromptControl = 'head' | 'neck' | 'atw' | 'thigh' | 'flick' | 'groove' | 'feet';
export type PromptGesture = 'tap' | 'hold' | 'swipe';
export type PromptAction = LessonId | 'kick' | 'miss';
export type PromptBeat = 'perfect' | 'good' | 'off';

export interface Lesson {
  id: LessonId;
  call: string;
  tip: string;
  missTip: string;
  control: PromptControl;
  gesture: PromptGesture;
  beat: boolean;
  bonus: number;
  tutorialSec: number;
  challengeSec: number;
  chainNeed: number;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'header',
    call: 'Head it!',
    tip: 'Tap HEAD as the ball drops.',
    missTip: 'HEAD is a tap while the ball is falling.',
    control: 'head',
    gesture: 'tap',
    beat: false,
    bonus: 5,
    tutorialSec: 14,
    challengeSec: 7,
    chainNeed: 1,
  },
  {
    id: 'thigh',
    call: 'Cushion it on your thigh!',
    tip: 'Tap THIGH. It plays on the next touch.',
    missTip: 'Tap THIGH while the ball is dropping to your knee.',
    control: 'thigh',
    gesture: 'tap',
    beat: false,
    bonus: 5,
    tutorialSec: 14,
    challengeSec: 7,
    chainNeed: 1,
  },
  {
    id: 'neck',
    call: 'Stall it on your neck!',
    tip: 'Tap NECK to flick, or hold it to stall.',
    missTip: 'Tap NECK as the ball reaches your collar, or hold to stall.',
    control: 'neck',
    gesture: 'hold',
    beat: false,
    bonus: 6,
    tutorialSec: 16,
    challengeSec: 8,
    chainNeed: 1,
  },
  {
    id: 'flick',
    call: 'Flick it high!',
    tip: 'Hold L or R. The ring fills, then release to kick higher.',
    missTip: 'Hold either foot and let go as the ball arrives.',
    control: 'feet',
    gesture: 'hold',
    beat: false,
    bonus: 6,
    tutorialSec: 14,
    challengeSec: 7,
    chainNeed: 1,
  },
  {
    id: 'rainbow',
    call: 'Hit a Rainbow!',
    tip: 'Tap ATW. The foot circles the ball, then catch the return.',
    missTip: 'Around the world needs the return catch.',
    control: 'atw',
    gesture: 'tap',
    beat: false,
    bonus: 8,
    tutorialSec: 16,
    challengeSec: 9,
    chainNeed: 1,
  },
  {
    id: 'groove',
    call: 'Groove on the beat!',
    tip: 'Tap GROOVE. It plays on the beat.',
    missTip: 'Tap GROOVE while the ring is wide.',
    control: 'groove',
    gesture: 'tap',
    beat: true,
    bonus: 8,
    tutorialSec: 14,
    challengeSec: 8,
    chainNeed: 1,
  },
  {
    id: 'chain',
    call: 'Chain 3 tricks!',
    tip: 'Land three tricks before the ring empties.',
    missTip: 'Keep going — another trick, not a plain kick.',
    control: 'feet',
    gesture: 'tap',
    beat: false,
    bonus: 12,
    tutorialSec: 20,
    challengeSec: 12,
    chainNeed: 3,
  },
];

export const REPEAT_AFTER = 3;
export const REPEAT_TIP = 'Same trick again — mix in a Rainbow, a Groove or a header.';
export const CHALLENGE_GAP_SEC = 10;
export const TIP_HOLD_SEC = 3.4;

export interface ActivePrompt {
  id: LessonId;
  call: string;
  tip: string;
  missTip: string;
  control: PromptControl;
  gesture: PromptGesture;
  beat: boolean;
  bonus: number;
  windowSec: number;
  tutorial: boolean;
  chainNeed: number;
  chainCount: number;
  startedAt: number;
}

export interface PromptClock {
  learned: LessonId[];
  active: ActivePrompt | null;
  expiresAt: number;
  nextAt: number;
  recent: LessonId[];
  tip: string | null;
  tipUntil: number;
  hints: boolean;
}

export interface PromptResult {
  clock: PromptClock;
  bonus: number;
  cheer: boolean;
  /** Newly learned lesson, when this completion finished a tutorial step. */
  learned: LessonId | null;
  call: string | null;
}

export function isLessonId(id: string): id is LessonId {
  return (LESSON_IDS as readonly string[]).includes(id);
}

export function lessonById(id: LessonId): Lesson {
  const lesson = LESSONS.find((item) => item.id === id);
  if (!lesson) throw new Error(`Unknown lesson ${id}`);
  return lesson;
}

export function normalizeLearned(raw: unknown): LessonId[] {
  if (!Array.isArray(raw)) return [];
  const out: LessonId[] = [];
  for (const id of raw) {
    if (typeof id === 'string' && isLessonId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Map a scored engine trick into a prompt action. Zero-point phases are ignored. */
export function actionForTrick(kind: string, phase: string, points: number): PromptAction | null {
  if (points <= 0) return null;
  switch (kind) {
    case 'header':
      return phase === 'execute' ? 'header' : null;
    case 'thigh':
      return phase === 'execute' ? 'thigh' : null;
    case 'neckStall':
      return phase === 'contact' ? 'neck' : null;
    case 'aroundTheWorld':
      return phase === 'recover' ? 'rainbow' : null;
    case 'groove':
      return phase === 'execute' ? 'groove' : null;
    case 'highFlick':
      return null;
    default:
      return null;
  }
}

export function nextLesson(learned: readonly LessonId[]): Lesson | null {
  return LESSONS.find((lesson) => !learned.includes(lesson.id)) ?? null;
}

export function freshClock(learned: readonly string[], hints: boolean): PromptClock {
  return {
    learned: normalizeLearned([...learned]),
    active: null,
    expiresAt: 0,
    nextAt: 0,
    recent: [],
    tip: null,
    tipUntil: 0,
    hints,
  };
}

/** A new run. The first lesson (or a later challenge) arms on the first playing tick. */
export function beginRun(learned: readonly string[], hints: boolean): PromptClock {
  const clock = freshClock(learned, hints);
  if (!hints) return clock;
  const pending = nextLesson(clock.learned);
  return { ...clock, nextAt: pending ? 0 : CHALLENGE_GAP_SEC };
}

function activate(lesson: Lesson, tutorial: boolean, now: number): ActivePrompt {
  return {
    id: lesson.id,
    call: lesson.call,
    tip: lesson.tip,
    missTip: lesson.missTip,
    control: lesson.control,
    gesture: lesson.gesture,
    beat: lesson.beat,
    bonus: lesson.bonus,
    windowSec: tutorial ? lesson.tutorialSec : lesson.challengeSec,
    tutorial,
    chainNeed: lesson.chainNeed,
    chainCount: 0,
    startedAt: now,
  };
}

function withActive(clock: PromptClock, lesson: Lesson, tutorial: boolean, now: number): PromptClock {
  const active = activate(lesson, tutorial, now);
  return { ...clock, active, expiresAt: now + active.windowSec };
}

/**
 * Expire a prompt, surface its tip, and arm the next one when it is due.
 * `pick` selects a challenge once every lesson has been learned.
 */
export function tickPrompts(clock: PromptClock, now: number, pick: number): PromptClock {
  if (!clock.hints) {
    if (!clock.active && clock.tip == null) return clock;
    return { ...clock, active: null, tip: null, tipUntil: 0 };
  }
  let next = clock;
  if (next.tip && now >= next.tipUntil) next = { ...next, tip: null, tipUntil: 0 };
  if (next.active && now >= next.expiresAt) {
    const expired = next.active;
    const tip = expired.tutorial ? expired.missTip : 'Too slow — watch the ring and the glowing button.';
    if (expired.tutorial) {
      return {
        ...withActive(next, lessonById(expired.id), true, now),
        tip,
        tipUntil: now + TIP_HOLD_SEC,
      };
    }
    return {
      ...next,
      active: null,
      tip,
      tipUntil: now + TIP_HOLD_SEC,
      nextAt: now + 4,
    };
  }
  if (!next.active && now >= next.nextAt) {
    const lesson = nextLesson(next.learned);
    if (lesson) return withActive(next, lesson, true, now);
    const choice = LESSONS[Math.abs(Math.floor(pick)) % LESSONS.length] ?? LESSONS[0];
    return {
      ...withActive(next, choice, false, now),
      nextAt: now + choice.challengeSec + CHALLENGE_GAP_SEC,
    };
  }
  return next;
}

function matches(active: ActivePrompt, action: LessonId, beat: PromptBeat | null): boolean {
  if (active.id === 'chain') return true;
  if (active.id !== action) return false;
  if (action === 'groove') return beat === 'perfect' || beat === 'good';
  return true;
}

const NO_BONUS: Pick<PromptResult, 'bonus' | 'cheer' | 'learned' | 'call'> = {
  bonus: 0,
  cheer: false,
  learned: null,
  call: null,
};

/** Apply a trick, a plain kick, or a miss. Plain kicks break a chain. */
export function applyPromptAction(
  clock: PromptClock,
  action: PromptAction,
  now: number,
  beat: PromptBeat | null,
): PromptResult {
  if (!clock.hints) return { clock, ...NO_BONUS };
  if (action === 'miss') {
    if (!clock.active) return { clock, ...NO_BONUS };
    return {
      clock: { ...clock, tip: clock.active.missTip, tipUntil: now + TIP_HOLD_SEC },
      ...NO_BONUS,
    };
  }
  if (action === 'kick') {
    const active = clock.active?.id === 'chain' && clock.active.chainCount > 0
      ? { ...clock.active, chainCount: 0 }
      : clock.active;
    return {
      clock: { ...clock, active, recent: [] },
      ...NO_BONUS,
    };
  }
  const recent = [...clock.recent, action].slice(-4);
  let tip = clock.tip;
  let tipUntil = clock.tipUntil;
  if (
    recent.length >= REPEAT_AFTER
    && recent.slice(-REPEAT_AFTER).every((id) => id === action)
    && action !== 'chain'
  ) {
    tip = REPEAT_TIP;
    tipUntil = now + TIP_HOLD_SEC;
  }
  const active = clock.active;
  if (!active || !matches(active, action, beat)) {
    const offBeat = active?.id === 'groove' && action === 'groove';
    const wrong = offBeat ? 'Off the beat — tap when the ring flashes.' : active ? active.missTip : tip;
    return {
      clock: {
        ...clock,
        recent,
        tip: active ? wrong : tip,
        tipUntil: active ? now + TIP_HOLD_SEC : tipUntil,
        active: active?.id === 'chain' ? { ...active, chainCount: 0 } : active,
      },
      ...NO_BONUS,
    };
  }
  if (active.id === 'chain' && active.chainCount + 1 < active.chainNeed) {
    return {
      clock: {
        ...clock,
        recent,
        tip,
        tipUntil,
        active: { ...active, chainCount: active.chainCount + 1 },
      },
      ...NO_BONUS,
    };
  }
  const learned = active.tutorial && !clock.learned.includes(active.id)
    ? [...clock.learned, active.id]
    : clock.learned;
  const following = active.tutorial ? nextLesson(learned) : null;
  const next = following
    ? withActive({ ...clock, learned, recent, tip: null, tipUntil: 0 }, following, true, now)
    : {
      ...clock,
      learned,
      recent,
      tip: null,
      tipUntil: 0,
      active: null,
      nextAt: now + CHALLENGE_GAP_SEC,
    };
  return {
    clock: next,
    bonus: active.bonus,
    cheer: true,
    learned: active.tutorial ? active.id : null,
    call: active.call,
  };
}
