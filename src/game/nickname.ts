/** Public tag for the world board. Not a real name, email, phone or link. */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

export type NicknameIssue =
  | 'empty'
  | 'length'
  | 'charset'
  | 'email'
  | 'phone'
  | 'url'
  | 'profanity'
  | 'real_name';

export type NicknameCheck =
  | { ok: true; nickname: string }
  | { ok: false; issue: NicknameIssue };

const GIVEN_NAMES = new Set([
  'ahmed', 'ali', 'amir', 'ana', 'anna', 'ava', 'carlos', 'chen', 'chloe', 'daniel',
  'david', 'elena', 'emma', 'fatima', 'hannah', 'hassan', 'ivan', 'james', 'john',
  'jose', 'juan', 'laura', 'leila', 'liam', 'lucas', 'luis', 'maria', 'mei', 'mia',
  'michael', 'mohammed', 'muhammad', 'noah', 'olga', 'oliver', 'omar', 'pedro',
  'priya', 'ravi', 'sarah', 'sofia', 'wei', 'yuki',
]);

const SURNAMES = new Set([
  'ali', 'brown', 'cohen', 'dubois', 'garcia', 'ivanov', 'jones', 'khan', 'kim',
  'kowalski', 'martin', 'nguyen', 'patel', 'rossi', 'santos', 'sato', 'silva',
  'smith', 'wang', 'yamada',
]);

/** Longer terms match inside the name. Short terms match a whole part, so "class" is allowed. */
const BLOCKED = [
  'asshole', 'bastard', 'bitch', 'bollocks', 'bullshit', 'cock', 'cunt', 'dick',
  'faggot', 'fuck', 'motherfucker', 'nigger', 'piss', 'prick', 'pussy', 'shit',
  'slut', 'twat', 'wanker',
] as const;

const SUGGEST_LEFT = ['Street', 'Alley', 'Brick', 'Rhythm', 'Groove', 'Court', 'Beat', 'Flick'] as const;
const SUGGEST_RIGHT = ['Kick', 'Touch', 'Tap', 'Hop', 'Spin', 'Jam', 'Clip', 'Roll'] as const;

function fold(value: string): string {
  return value.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
}

function looksLikeEmail(raw: string): boolean {
  if (raw.includes('@')) return true;
  return /(gmail|hotmail|outlook|yahoo|icloud)/i.test(raw);
}

function looksLikeUrl(raw: string): boolean {
  if (/(https?:\/\/|www\.)/i.test(raw) || /\.(com|net|org|io|gg)\b/i.test(raw)) return true;
  const flat = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return flat.includes('http') || flat.includes('www') || flat.includes('dotcom');
}

function looksLikePhone(raw: string): boolean {
  if (/\d{7,}/.test(raw.replace(/\D/g, '')) && (raw.match(/\d/g)?.length ?? 0) >= 7) {
    const letters = raw.replace(/[^A-Za-z]/g, '');
    if (letters.length === 0 || /\d{7,}/.test(raw)) return true;
  }
  return false;
}

function nameParts(raw: string): string[] {
  const split = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length >= 2);
  return split;
}

function looksLikeRealName(raw: string): boolean {
  const parts = nameParts(raw);
  if (parts.length === 0 || parts.length > 2) return false;
  if (parts.length === 1) return GIVEN_NAMES.has(parts[0] ?? '') || SURNAMES.has(parts[0] ?? '');
  const [first, second] = parts;
  if (!first || !second) return false;
  return GIVEN_NAMES.has(first) && (GIVEN_NAMES.has(second) || SURNAMES.has(second));
}

function isProfane(raw: string): boolean {
  const folded = fold(raw).replace(/[^a-z]/g, '');
  return BLOCKED.some((word) => folded.includes(word));
}

export function nicknameMessage(issue: NicknameIssue): string {
  switch (issue) {
    case 'empty': return 'Type a nickname.';
    case 'length': return 'Use 3 to 16 characters.';
    case 'charset': return 'Letters, numbers and underscore only.';
    case 'email': return 'No email addresses.';
    case 'phone': return 'No phone numbers.';
    case 'url': return 'No links.';
    case 'profanity': return 'Pick a different nickname.';
    case 'real_name': return 'Use a nickname, not a real name.';
    default: {
      const unexpected: never = issue;
      return unexpected;
    }
  }
}

export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  if (!nickname) return { ok: false, issue: 'empty' };
  if (looksLikeEmail(nickname)) return { ok: false, issue: 'email' };
  if (looksLikeUrl(nickname)) return { ok: false, issue: 'url' };
  if (looksLikePhone(nickname)) return { ok: false, issue: 'phone' };
  if (!/^[A-Za-z0-9_]+$/.test(nickname)) return { ok: false, issue: 'charset' };
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return { ok: false, issue: 'length' };
  if (isProfane(nickname)) return { ok: false, issue: 'profanity' };
  if (looksLikeRealName(nickname)) return { ok: false, issue: 'real_name' };
  return { ok: true, nickname };
}

/** A street tag such as StreetKick42. Always passes checkNickname. */
export function suggestNickname(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const left = SUGGEST_LEFT[Math.floor(random() * SUGGEST_LEFT.length)] ?? 'Street';
    const right = SUGGEST_RIGHT[Math.floor(random() * SUGGEST_RIGHT.length)] ?? 'Kick';
    const n = 10 + Math.floor(random() * 90);
    const candidate = `${left}${right}${n}`;
    if (checkNickname(candidate).ok) return candidate;
  }
  return 'StreetKick42';
}
