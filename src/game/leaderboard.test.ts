import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockLeaderboard, formatRank, isoWeekStartUtc, type BoardEntry } from './leaderboard';
import { PREVIEW_LONG_NICKNAMES } from './mockBoard';
import { checkNickname, composeNickname, NICKNAME_MAX } from './nickname';
import { ADJECTIVES, NOUNS } from './nicknameWords';
import { DEVICE_ID_KEY } from './nicknameStore';

const NOW = 1_700_000_000_000;

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } satisfies Storage;
}

describe('mock leaderboard', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('ranks a higher score above a lower one and formats the place', () => {
    const board = createMockLeaderboard({ nickname: 'StreetKick42', storage: memory(), now: NOW });
    const low = board.rankFor(0, NOW);
    const mid = board.rankFor(23, NOW);
    const high = board.rankFor(2000, NOW);
    expect(low.rank).toBeNull();
    expect(low.score).toBe(0);
    expect(board.around(0, 'world', 'all', NOW).me.rank).toBe(0);
    expect(mid.rank).not.toBeNull();
    expect(high.rank).not.toBeNull();
    expect(mid.rank!).toBeGreaterThan(high.rank!);
    expect(low.total).toBe(1600);
    expect(mid.total).toBe(1601);
    expect(formatRank(mid.rank)).toMatch(/^#[\d,]+$/);
    expect(mid.country).toBeNull();
    expect(mid.countryRank).toBeNull();
    expect(board.deviceId).not.toBe('StreetKick42');
    expect(board.deviceId).toMatch(/^[0-9a-f-]{16,64}$/i);
  });

  it('shows three neighbours and a different weekly board', () => {
    const board = createMockLeaderboard({ nickname: 'StreetKick42', storage: memory(), now: NOW });
    const around = board.around(23, 'world', 'all', NOW);
    expect(around.above).toHaveLength(3);
    expect(around.below).toHaveLength(3);
    expect(around.me.mine).toBe(true);
    expect(around.me.nickname).toBe('StreetKick42');
    expect(around.me.score).toBe(23);
    expect(around.above.every((row) => row.rank < around.me.rank && row.score >= around.me.score)).toBe(true);
    expect(around.below.every((row) => row.rank > around.me.rank)).toBe(true);
    const week = board.around(23, 'world', 'week', NOW);
    expect(week.me.rank).not.toBe(around.me.rank);
    const top = board.top('world', 23, 10, 'all', NOW);
    expect(top).toHaveLength(10);
    expect(top[0]?.rank).toBe(1);
    expect(top.some((row) => row.mine)).toBe(false);
  });

  it('keeps the best submit and hides a reported name', () => {
    const storage = memory();
    const board = createMockLeaderboard({ nickname: 'StreetKick42', storage, now: NOW });
    expect(board.submit(23, NOW).accepted).toBe(true);
    expect(board.submit(10, NOW + 1)).toEqual({ accepted: false, best: 23 });
    expect(board.submit(40, NOW + 2)).toEqual({ accepted: true, best: 40 });
    const before = board.rankFor(23, NOW).rank ?? 0;
    const around = board.around(23, 'world', 'all', NOW);
    const target = around.above[0]?.nickname ?? '';
    const spared = around.above[1]?.nickname ?? '';
    board.report(spared, 'nope' as 'rude');
    expect(board.around(23, 'world', 'all', NOW).above.some((row) => row.nickname === spared)).toBe(true);
    board.report(target, 'rude');
    board.report('StreetKick42', 'rude');
    expect(board.rankFor(23, NOW).rank).toBe(before - 1);
    expect(board.around(23, 'world', 'all', NOW).above.some((row) => row.nickname === target)).toBe(false);
    const again = createMockLeaderboard({ nickname: 'StreetKick42', storage, now: NOW });
    expect(again.submit(40, NOW)).toEqual({ accepted: false, best: 40 });
    expect(again.deviceId).toBe(board.deviceId);
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(board.deviceId);
    const entry = again.top('world', 23, 1, 'all', NOW)[0];
    expect(entry && 'deviceId' in entry).toBe(false);
  });

  it('ranks a chosen country separately and leaves International off that board', () => {
    const hidden = createMockLeaderboard({ nickname: 'StreetKick42', country: null, storage: memory(), now: NOW });
    expect(hidden.rankFor(23, NOW).countryRank).toBeNull();
    expect(hidden.top('country', 23, 10, 'all', NOW)).toEqual([]);
    expect(hidden.around(23, 'country', 'all', NOW).me.rank).toBe(0);

    const board = createMockLeaderboard({ nickname: 'StreetKick42', country: 'gb', storage: memory(), now: NOW });
    const snap = board.rankFor(23, NOW);
    expect(board.country).toBe('GB');
    expect(snap.country).toBe('GB');
    expect(snap.countryRank).not.toBeNull();
    expect(snap.countryRank!).toBeLessThan(snap.rank!);
    const around = board.around(23, 'country', 'all', NOW);
    const rows = [...around.above, around.me, ...around.below];
    expect(around.me.mine).toBe(true);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.country === 'GB')).toBe(true);
    const world = board.top('world', 23, 50, 'all', NOW);
    expect(world.length).toBeGreaterThan(0);
    expect(world.some((row) => row.country != null)).toBe(true);
    const worldAround = board.around(23, 'world', 'all', NOW);
    expect(worldAround.me.country).toBe('GB');
    expect([...worldAround.above, ...worldAround.below].some((row) => row.country != null)).toBe(true);
  });

  it('shows a country review board of more than 20 word-list names', () => {
    const allowed = new Set(ADJECTIVES.flatMap((adjective) => NOUNS.map((noun) => `${adjective} ${noun}`)));
    const board = createMockLeaderboard({ nickname: 'Turbo Striker', country: 'GB', storage: memory(), now: NOW });
    const country = board.board('all', 'country', 420, 25, NOW);
    expect(country.hidden).toBe(false);
    expect(country.rows.length).toBeGreaterThanOrEqual(20);
    expect(country.rows.every((row) => row.country === 'GB')).toBe(true);
    const today = board.board('day', 'country', 420, 25, NOW);
    expect(today.hidden).toBe(false);
    expect(today.rows.length).toBeGreaterThanOrEqual(20);
    const world = board.board('all', 'world', 420, 25, NOW);
    expect(world.rows.length).toBeGreaterThanOrEqual(10);
    expect(world.rows.filter((row) => !row.mine).length).toBeGreaterThanOrEqual(5);
    expect(world.rows.some((row) => row.country != null)).toBe(true);
    expect(board.around(420, 'world', 'all', NOW).me.country).toBe('GB');
    const preview: string[] = [...PREVIEW_LONG_NICKNAMES];
    expect(preview).toHaveLength(2);
    expect(preview[0]!.length).toBeGreaterThanOrEqual(preview[1]!.length);
    expect(preview[0]!.length).toBeLessThanOrEqual(NICKNAME_MAX);
    expect(preview.every((name) => checkNickname(name).ok)).toBe(true);
    let first = '';
    let second = '';
    const consider = (nickname: string | null) => {
      if (!nickname || nickname === first || nickname === second || !checkNickname(nickname).ok) return;
      if (nickname.length > first.length) {
        second = first;
        first = nickname;
      } else if (nickname.length > second.length) second = nickname;
    };
    for (const adjective of ADJECTIVES) {
      for (const noun of NOUNS) {
        consider(composeNickname(adjective, noun));
        for (let suffix = 2; suffix <= 40; suffix += 1) consider(composeNickname(adjective, noun, suffix));
      }
    }
    expect(preview).toEqual([first, second]);
    expect(world.rows.some((row) => preview.includes(row.nickname))).toBe(true);
    const sample: BoardEntry = { rank: 1, nickname: preview[0] ?? '', score: 1, country: null, mine: false };
    expect('kit' in sample).toBe(false);
    expect(world.rows.every((row) => allowed.has(row.nickname) || preview.includes(row.nickname) || row.mine)).toBe(true);
  });

  it('hides a country board with fewer than 20 players', () => {
    const board = createMockLeaderboard({ nickname: 'Turbo Striker', country: 'AD', storage: memory(), now: NOW });
    expect(board.rankFor(23, NOW).countryHidden).toBe(true);
    expect(board.rankFor(23, NOW).countryRank).toBeNull();
    expect(board.board('all', 'country', 23, 10, NOW)).toEqual({ hidden: true, rows: [] });
    expect(board.board('day', 'world', 23, 10, NOW).hidden).toBe(false);
    expect(board.around(23, 'world', 'all', NOW).me.country).toBe('AD');
    expect(board.board('all', 'world', 23, 10, NOW).hidden).toBe(false);
    expect(board.rankFor(23, NOW).worldHidden).toBe(false);
  });

  it('hides every world time frame until 20 players have scored', () => {
    const periods = ['day', 'week', 'month', 'year', 'all'] as const;
    const small = createMockLeaderboard({
      nickname: 'StreetKick42',
      country: 'GB',
      storage: memory(),
      now: NOW,
      crowdSize: 8,
    });
    for (const period of periods) {
      const page = small.board(period, 'world', 23, 50, NOW);
      expect(page).toEqual({ hidden: true, rows: [] });
      const around = small.around(23, 'world', period, NOW);
      expect(around.above).toEqual([]);
      expect(around.below).toEqual([]);
      expect(JSON.stringify(page)).not.toContain('nickname');
    }
    const snap = small.rankFor(23, NOW);
    expect(snap.worldHidden).toBe(true);
    expect(snap.rank).toBeNull();
    expect(snap.total).toBe(0);
    expect(formatRank(snap.rank)).toBe('—');
    expect(small.board('all', 'country', 23, 10, NOW)).toEqual({ hidden: true, rows: [] });

    const ready = createMockLeaderboard({
      nickname: 'StreetKick42',
      country: 'GB',
      storage: memory(),
      now: NOW,
      crowdSize: 19,
    });
    const world = ready.board('all', 'world', 420, 25, NOW);
    expect(world.hidden).toBe(false);
    expect(world.rows.length).toBeGreaterThanOrEqual(20);
    expect(world.rows.some((row) => row.nickname.length > 0)).toBe(true);
    expect(ready.rankFor(420, NOW).worldHidden).toBe(false);
    expect(ready.rankFor(420, NOW).rank).not.toBeNull();
    expect(ready.board('day', 'world', 420, 25, NOW).hidden).toBe(true);
  });

  it('treats a week as Monday 00:00 UTC through the following Sunday', () => {
    const wednesday = Date.UTC(2026, 9, 21, 15, 0, 0);
    expect(isoWeekStartUtc(wednesday)).toBe(Date.UTC(2026, 9, 19));
    expect(new Date(isoWeekStartUtc(wednesday)).getUTCDay()).toBe(1);
    const sundayEvening = Date.UTC(2026, 9, 18, 23, 0, 0);
    expect(isoWeekStartUtc(sundayEvening)).toBe(Date.UTC(2026, 9, 12));
    expect(formatRank(null)).toBe('—');
  });
});
