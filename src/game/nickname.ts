import { ADJECTIVES, NOUNS } from './nicknameWords';

/** Stored tags look like "Turbo Striker" or "Turbo Striker II". The server adds the numeral. */
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 40;

const ADJECTIVE_BY_LOWER = new Map(ADJECTIVES.map((word) => [word.toLowerCase(), word]));
const NOUN_BY_LOWER = new Map(NOUNS.map((word) => [word.toLowerCase(), word]));

const ROMAN_PARTS: readonly [number, string][] = [
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export type NicknameIssue = 'empty' | 'not_in_list' | 'length';

export type NicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; issue: NicknameIssue };

export interface ParsedNickname {
  adjective: string;
  noun: string;
  /** Null on the first tag. The next player with the same words is 2 ("II"). */
  suffix: number | null;
  nickname: string;
}

/** Roman numeral for 1–40. Empty when the value is outside that range. */
export function romanNumeral(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 40) return '';
  let remaining = value;
  let out = '';
  for (const [amount, glyph] of ROMAN_PARTS) {
    while (remaining >= amount) {
      out += glyph;
      remaining -= amount;
    }
  }
  return out;
}

export function romanValue(text: string): number | null {
  if (!text) return null;
  for (let value = 1; value <= 40; value += 1) {
    if (romanNumeral(value) === text) return value;
  }
  return null;
}

export function composeNickname(adjective: string, noun: string, suffix?: number | null): string | null {
  const left = ADJECTIVE_BY_LOWER.get(adjective.trim().toLowerCase());
  const right = NOUN_BY_LOWER.get(noun.trim().toLowerCase());
  if (!left || !right) return null;
  if (suffix == null || suffix <= 1) {
    const base = `${left} ${right}`;
    return base.length <= NICKNAME_MAX ? base : null;
  }
  const roman = romanNumeral(suffix);
  if (!roman) return null;
  const full = `${left} ${right} ${roman}`;
  return full.length <= NICKNAME_MAX ? full : null;
}

const NICK_RE = /^([A-Za-z]+) ([A-Za-z]+)(?: ([IVXLCDM]+))?$/;

export function parseNickname(raw: string): ParsedNickname | null {
  const match = NICK_RE.exec(raw.trim());
  if (!match) return null;
  const adjective = ADJECTIVE_BY_LOWER.get((match[1] ?? '').toLowerCase());
  const noun = NOUN_BY_LOWER.get((match[2] ?? '').toLowerCase());
  if (!adjective || !noun) return null;
  const roman = match[3];
  let suffix: number | null = null;
  if (roman) {
    const value = romanValue(roman);
    if (value == null || value < 2) return null;
    suffix = value;
  }
  const nickname = composeNickname(adjective, noun, suffix);
  if (!nickname) return null;
  return { adjective, noun, suffix, nickname };
}

export function nicknameMessage(issue: NicknameIssue): string {
  switch (issue) {
    case 'empty':
      return 'Pick two words.';
    case 'not_in_list':
      return 'Pick two words from the lists.';
    case 'length':
      return 'That nickname is too long.';
    default: {
      const unexpected: never = issue;
      return unexpected;
    }
  }
}

export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  if (!nickname) return { ok: false, issue: 'empty' };
  if (nickname.length > NICKNAME_MAX) return { ok: false, issue: 'length' };
  const parsed = parseNickname(nickname);
  if (!parsed) return { ok: false, issue: 'not_in_list' };
  return { ok: true, nickname: parsed.nickname };
}

/** Pairs that stay off the board even though each word is allowed on its own. */
export const BLOCKED_PAIRS: readonly (readonly [string, string])[] = [
  ['Ghost', 'Rider'],
  ['Power', 'Ranger'],
  ['Ninja', 'Turtle'],
  ['Desert', 'Eagle'],
  ['Silver', 'Fox'],
];

const BLOCKED_PAIR_KEYS = new Set(BLOCKED_PAIRS.map(([adjective, noun]) => `${adjective.toLowerCase()} ${noun.toLowerCase()}`));

export function isBlockedPair(adjective: string, noun: string): boolean {
  return BLOCKED_PAIR_KEYS.has(`${adjective.trim().toLowerCase()} ${noun.trim().toLowerCase()}`);
}

/** Move the side the player just changed until the pair is allowed. */
export function unblockIndex(kind: 'adjective' | 'noun', adjIndex: number, nounIndex: number): number {
  const length = kind === 'adjective' ? ADJECTIVES.length : NOUNS.length;
  let adj = adjIndex;
  let noun = nounIndex;
  for (let step = 0; step < length; step += 1) {
    const left = ADJECTIVES[adj];
    const right = NOUNS[noun];
    if (left && right && !isBlockedPair(left, right)) return kind === 'adjective' ? adj : noun;
    switch (kind) {
      case 'adjective':
        adj = (adj + 1) % ADJECTIVES.length;
        break;
      case 'noun':
        noun = (noun + 1) % NOUNS.length;
        break;
      default: {
        const unexpected: never = kind;
        return unexpected;
      }
    }
  }
  return kind === 'adjective' ? adjIndex : nounIndex;
}

/** A random pair such as Turbo Striker. Always passes checkNickname. */
export function suggestNickname(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)] ?? 'Turbo';
    const noun = NOUNS[Math.floor(random() * NOUNS.length)] ?? 'Striker';
    if (!isBlockedPair(adjective, noun)) return `${adjective} ${noun}`;
  }
  return `${ADJECTIVES[0] ?? 'Turbo'} ${NOUNS[0] ?? 'Striker'}`;
}

export function wordIndex(words: readonly string[], word: string): number {
  const found = words.findIndex((item) => item.toLowerCase() === word.trim().toLowerCase());
  return found >= 0 ? found : 0;
}

export interface FreePair {
  adjective: string;
  noun: string;
}

/** Prefer a suggested pair that is not the one already on screen. */
export function pickFreePair(
  names: readonly FreePair[],
  current: FreePair,
  random: () => number = Math.random,
): FreePair | null {
  const same = (name: FreePair) => name.adjective.toLowerCase() === current.adjective.toLowerCase()
    && name.noun.toLowerCase() === current.noun.toLowerCase();
  const others = names.filter((name) => !same(name));
  const pool = others.length > 0 ? others : names;
  if (pool.length === 0) return null;
  return pool[Math.floor(random() * pool.length)] ?? null;
}
