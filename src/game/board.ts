export interface Rival {
  nickname: string;
  country: string;
  score: number;
}

export interface BoardRow extends Rival {
  you: boolean;
}

/** Fixed arcade rivals stored on this device. Not a network call. */
export const WORLD_RIVALS: readonly Rival[] = [
  { nickname: 'Nala', country: 'NG', score: 40 },
  { nickname: 'Luis', country: 'MX', score: 55 },
  { nickname: 'Chloé', country: 'FR', score: 70 },
  { nickname: 'Kenji', country: 'JP', score: 90 },
  { nickname: 'Amara', country: 'GH', score: 110 },
  { nickname: 'Bruno', country: 'BR', score: 130 },
  { nickname: 'Sofi', country: 'AR', score: 155 },
  { nickname: 'Yara', country: 'BR', score: 180 },
  { nickname: 'Hugo', country: 'PT', score: 210 },
  { nickname: 'Mika', country: 'JP', score: 250 },
];

const NICK_MAX = 12;

/** Trim, drop control characters, cap the length. An empty name becomes Kicky. */
export function sanitizeNickname(raw: string): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, NICK_MAX);
  return cleaned.length > 0 ? cleaned : 'Kicky';
}

/**
 * Rank rivals plus the player. Ties keep the rival ahead, so the row climbs only when the score passes them.
 * `rank` is the 0-based index of the player after sorting.
 */
export function worldBoard(nickname: string, score: number, rivals: readonly Rival[] = WORLD_RIVALS): { rows: BoardRow[]; rank: number } {
  const you: BoardRow = {
    nickname: sanitizeNickname(nickname),
    country: 'YOU',
    score: Number.isFinite(score) && score > 0 ? score : 0,
    you: true,
  };
  const rows: BoardRow[] = [
    ...rivals.map((rival) => ({ ...rival, you: false })),
    you,
  ].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.you !== b.you) return a.you ? 1 : -1;
    return a.nickname.localeCompare(b.nickname);
  });
  const rank = rows.findIndex((row) => row.you);
  return { rows, rank };
}
