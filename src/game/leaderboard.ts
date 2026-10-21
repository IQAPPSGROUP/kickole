import { loadDeviceId } from './nicknameStore';

/** World is all-time. Week is the last seven days. */
export type BoardScope = 'world' | 'week';

export interface BoardEntry {
  rank: number;
  nickname: string;
  score: number;
  mine: boolean;
}

export interface RankSnapshot {
  rank: number;
  total: number;
  nickname: string;
  score: number;
}

export interface AroundMe {
  above: BoardEntry[];
  me: BoardEntry;
  below: BoardEntry[];
}

export interface SubmitResult {
  accepted: boolean;
  best: number;
}

/**
 * The live client talks to this. `createMockLeaderboard` is the local stand-in.
 * A later Supabase client should implement the same methods and nothing else in the UI.
 */
export interface LeaderboardService {
  readonly nickname: string;
  /** Install id sent with a score. Never render this. */
  readonly deviceId: string;
  rankFor(score: number, now?: number): RankSnapshot;
  around(score: number, scope: BoardScope, now?: number): AroundMe;
  top(scope: BoardScope, score: number, limit: number, now?: number): BoardEntry[];
  submit(score: number, at?: number): SubmitResult;
  report(nickname: string): void;
  block(nickname: string): void;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CROWD = 1600;
const BEST_KEY = 'kicky.board.best.v1';
const BLOCKS_KEY = 'kicky.board.blocks.v1';
const REPORTS_KEY = 'kicky.board.reports.v1';

const LEFT = ['Street', 'Alley', 'Brick', 'Rhythm', 'Groove', 'Court', 'Beat', 'Flick'] as const;
const RIGHT = ['Kick', 'Touch', 'Tap', 'Hop', 'Spin', 'Jam', 'Clip', 'Roll'] as const;

interface CrowdRow {
  nickname: string;
  score: number;
  at: number;
}

interface StoredBest {
  deviceId: string;
  score: number;
  at: number;
}

function crowdNickname(index: number): string {
  const left = LEFT[index % LEFT.length] ?? 'Street';
  const right = RIGHT[Math.floor(index / LEFT.length) % RIGHT.length] ?? 'Kick';
  const n = 10 + (Math.floor(index / (LEFT.length * RIGHT.length)) % 90);
  return `${left}${right}${n}`;
}

function crowdScore(index: number): number {
  const t = index / (CROWD - 1);
  return 1 + Math.round(t * t * 3000);
}

function crowdAt(index: number, now: number): number {
  const ageDays = index % 21;
  return now - ageDays * 24 * 60 * 60 * 1000 - (index % 50) * 60 * 1000;
}

function readList(storage: Storage, key: string): string[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function readBest(storage: Storage): StoredBest | null {
  try {
    const raw = storage.getItem(BEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBest>;
    if (!parsed || typeof parsed.score !== 'number' || typeof parsed.at !== 'number' || typeof parsed.deviceId !== 'string') return null;
    return { deviceId: parsed.deviceId, score: parsed.score, at: parsed.at };
  } catch {
    return null;
  }
}

function byStanding(a: CrowdRow, b: CrowdRow): number {
  return b.score - a.score || a.at - b.at;
}

export function formatRank(rank: number): string {
  return `#${Math.max(1, Math.floor(rank)).toLocaleString('en-US')}`;
}

export function createMockLeaderboard(options: {
  nickname: string;
  storage?: Storage;
  now?: number;
}): LeaderboardService {
  const storage = options.storage ?? localStorage;
  const nickname = options.nickname;
  const deviceId = loadDeviceId(storage);
  const blocks = new Set(readList(storage, BLOCKS_KEY).map((name) => name.toLowerCase()));
  const reports = new Set(readList(storage, REPORTS_KEY).map((name) => name.toLowerCase()));
  let best = readBest(storage);

  const persistSets = () => {
    try {
      storage.setItem(BLOCKS_KEY, JSON.stringify([...blocks]));
      storage.setItem(REPORTS_KEY, JSON.stringify([...reports]));
    } catch {
      /* the in-memory board still hides the name this session */
    }
  };

  const crowd = (now: number, scope: BoardScope): CrowdRow[] => {
    const rows: CrowdRow[] = [];
    const mine = nickname.toLowerCase();
    for (let index = 0; index < CROWD; index += 1) {
      const rowName = crowdNickname(index);
      const key = rowName.toLowerCase();
      if (key === mine || blocks.has(key)) continue;
      const at = crowdAt(index, now);
      if (scope === 'week' && now - at > WEEK_MS) continue;
      rows.push({ nickname: rowName, score: crowdScore(index), at });
    }
    return rows;
  };

  const placed = (score: number, scope: BoardScope, now: number): BoardEntry[] => {
    const at = now;
    const rows = crowd(now, scope);
    const combined: Array<CrowdRow & { mine: boolean }> = [
      ...rows.map((row) => ({ ...row, mine: false })),
      { nickname, score: Math.max(0, Math.floor(score)), at, mine: true },
    ];
    combined.sort(byStanding);
    return combined.map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      score: row.score,
      mine: row.mine,
    }));
  };

  return {
    nickname,
    deviceId,
    rankFor(score, now = Date.now()) {
      const board = placed(score, 'world', now);
      const me = board.find((row) => row.mine);
      return {
        rank: me?.rank ?? board.length,
        total: board.length,
        nickname,
        score: Math.max(0, Math.floor(score)),
      };
    },
    around(score, scope, now = Date.now()) {
      const board = placed(score, scope, now);
      const index = board.findIndex((row) => row.mine);
      const me = board[index] ?? { rank: 1, nickname, score: Math.floor(score), mine: true };
      return {
        above: board.slice(Math.max(0, index - 3), index),
        me,
        below: board.slice(index + 1, index + 4),
      };
    },
    top(scope, score, limit, now = Date.now()) {
      return placed(score, scope, now).slice(0, Math.max(1, limit));
    },
    submit(score, at = Date.now()) {
      const rounded = Math.floor(score);
      const previous = best?.score ?? 0;
      if (!Number.isFinite(score) || rounded < 0 || (best && rounded <= best.score)) {
        return { accepted: false, best: previous };
      }
      best = { deviceId, score: rounded, at };
      try {
        storage.setItem(BEST_KEY, JSON.stringify(best));
      } catch {
        /* session memory still has the best */
      }
      return { accepted: true, best: rounded };
    },
    report(name) {
      const key = name.trim().toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      reports.add(key);
      blocks.add(key);
      persistSets();
    },
    block(name) {
      const key = name.trim().toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      blocks.add(key);
      persistSets();
    },
  };
}
