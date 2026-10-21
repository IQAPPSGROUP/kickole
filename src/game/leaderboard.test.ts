import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockLeaderboard, formatRank } from './leaderboard';
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
    expect(low.rank).toBeGreaterThan(mid.rank);
    expect(mid.rank).toBeGreaterThan(high.rank);
    expect(low.total).toBe(mid.total);
    expect(formatRank(mid.rank)).toMatch(/^#[\d,]+$/);
    expect(board.deviceId).not.toBe('StreetKick42');
    expect(board.deviceId).toMatch(/^[0-9a-f-]{16,64}$/i);
  });

  it('shows three neighbours and a different weekly board', () => {
    const board = createMockLeaderboard({ nickname: 'StreetKick42', storage: memory(), now: NOW });
    const around = board.around(23, 'world', NOW);
    expect(around.above).toHaveLength(3);
    expect(around.below).toHaveLength(3);
    expect(around.me.mine).toBe(true);
    expect(around.me.nickname).toBe('StreetKick42');
    expect(around.me.score).toBe(23);
    expect(around.above.every((row) => row.rank < around.me.rank && row.score >= around.me.score)).toBe(true);
    expect(around.below.every((row) => row.rank > around.me.rank)).toBe(true);
    const week = board.around(23, 'week', NOW);
    expect(week.me.rank).not.toBe(around.me.rank);
    const top = board.top('world', 23, 10, NOW);
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
    const before = board.rankFor(23, NOW).rank;
    const target = board.around(23, 'world', NOW).above[0]?.nickname ?? '';
    board.report(target);
    board.report('StreetKick42');
    expect(board.rankFor(23, NOW).rank).toBe(before - 1);
    expect(board.around(23, 'world', NOW).above.some((row) => row.nickname === target)).toBe(false);
    const again = createMockLeaderboard({ nickname: 'StreetKick42', storage, now: NOW });
    expect(again.submit(40, NOW)).toEqual({ accepted: false, best: 40 });
    expect(again.deviceId).toBe(board.deviceId);
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(board.deviceId);
    const entry = again.top('world', 23, 1, NOW)[0];
    expect(entry && 'deviceId' in entry).toBe(false);
  });
});
