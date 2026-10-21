import { COUNTRIES, countryByCode } from './countries';
import { isBlockedPair } from './nickname';
import { ADJECTIVES, NOUNS } from './nicknameWords';
import { loadDeviceId } from './nicknameStore';

/** Day, ISO week (Monday 00:00 UTC), calendar month, calendar year, or all-time. */
export type BoardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

/** World is every player. Country is one self-chosen code. */
export type BoardScope = 'world' | 'country';

/** A country board with fewer players than this stays hidden. */
export const COUNTRY_BOARD_MIN = 20;

export const BOARD_BLOCKS_KEY = 'kicky.board.blocks.v1';

export interface BoardEntry {
  rank: number;
  nickname: string;
  score: number;
  /** ISO alpha-2, or null when this player chose not to say. */
  country: string | null;
  mine: boolean;
}

export interface BoardPage {
  hidden: boolean;
  rows: BoardEntry[];
}

export interface RankSnapshot {
  /** Null when the live board has not answered. The panel shows a dash. */
  rank: number | null;
  total: number;
  nickname: string;
  score: number;
  /** Null when the player prefers not to say, or has not chosen. */
  country: string | null;
  /** Null when they are excluded from country boards, or that board is hidden. */
  countryRank: number | null;
  /** True when their country has fewer than {@link COUNTRY_BOARD_MIN} players this period. */
  countryHidden: boolean;
}

export interface RunSubmit {
  combo: number;
  durationMs: number;
  /** Kick timestamps in milliseconds from the start of the run. */
  kickTimesMs?: readonly number[];
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
 * The UI talks only to this. `createMockLeaderboard` is the local stand-in (`?mockBoard=1`).
 * `createSupabaseLeaderboard` calls the private-schema RPCs.
 */
export interface LeaderboardService {
  readonly nickname: string;
  /** Self-chosen ISO alpha-2. Null excludes this player from country boards. */
  readonly country: string | null;
  /** Install id sent with a score. Never render this. */
  readonly deviceId: string;
  /** Bumps when an async refresh lands so React can re-render. */
  readonly revision: number;
  subscribe(listener: () => void): () => void;
  /** Begin quiet fetches. Safe to call more than once. */
  start(): void;
  /** Ignore in-flight results. The next `start` fetches again. */
  stop(): void;
  /** Ask the server for a single-use run token. Offline play still works. */
  startRun(): void;
  rankFor(score: number, now?: number): RankSnapshot;
  around(score: number, scope: BoardScope, period?: BoardPeriod, now?: number): AroundMe;
  top(scope: BoardScope, score: number, limit: number, period?: BoardPeriod, now?: number): BoardEntry[];
  board(period: BoardPeriod, scope: BoardScope, score: number, limit?: number, now?: number): BoardPage;
  submit(score: number, at?: number, run?: RunSubmit): SubmitResult;
  report(nickname: string): void;
  block(nickname: string): void;
  unblock(nickname: string): void;
  blockedNames(): string[];
  /** Removes this install's nickname, scores and device id after the server accepts. */
  deleteData(): Promise<boolean>;
}

/** Monday 00:00 UTC of the ISO week that contains `now`. */
export function isoWeekStartUtc(now: number): number {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysFromMonday = (date.getUTCDay() + 6) % 7;
  return midnight - daysFromMonday * 86_400_000;
}

export function periodStart(period: BoardPeriod, now: number): number {
  const date = new Date(now);
  switch (period) {
    case 'day':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    case 'week':
      return isoWeekStartUtc(now);
    case 'month':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case 'year':
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    case 'all':
      return 0;
    default: {
      const neverPeriod: never = period;
      return neverPeriod;
    }
  }
}

const CROWD = 1600;
const BEST_KEY = 'kicky.board.best.v1';
const REPORTS_KEY = 'kicky.board.reports.v1';
const POPULAR = ['GB', 'BR', 'US', 'NG', 'FR', 'JP', 'DE', 'ES', 'IT', 'MX'] as const;
const POPULAR_SET = new Set<string>(POPULAR);
const TAIL = COUNTRIES.map((country) => country.code).filter((code) => !POPULAR_SET.has(code) && code !== 'AD');

interface CrowdRow {
  nickname: string;
  score: number;
  at: number;
  country: string;
}

interface StandingRow {
  nickname: string;
  score: number;
  at: number;
  mine: boolean;
  country: string | null;
}

interface StoredBest {
  deviceId: string;
  score: number;
  at: number;
}

function crowdNickname(index: number): string {
  const adjective = ADJECTIVES[index % ADJECTIVES.length] ?? 'Turbo';
  let nounIndex = Math.floor(index / ADJECTIVES.length) % NOUNS.length;
  let noun = NOUNS[nounIndex] ?? 'Striker';
  if (isBlockedPair(adjective, noun)) {
    nounIndex = (nounIndex + 1) % NOUNS.length;
    noun = NOUNS[nounIndex] ?? 'Striker';
  }
  return `${adjective} ${noun}`;
}

function crowdScore(index: number): number {
  const t = index / (CROWD - 1);
  return 1 + Math.round(t * t * 3000);
}

function crowdCountry(index: number): string {
  if (index % 200 === 0) return 'AD';
  if (index % 10 < 7) return POPULAR[index % POPULAR.length] ?? 'GB';
  return TAIL[index % TAIL.length] ?? 'GB';
}

function crowdAt(index: number, now: number): number {
  const code = crowdCountry(index);
  const ageDays = POPULAR_SET.has(code) ? index % 3 : 7 + (index % 14);
  return now - ageDays * 24 * 60 * 60 * 1000 - (index % 50) * 60 * 1000;
}

function inPeriod(period: BoardPeriod, at: number, now: number): boolean {
  if (at > now) return false;
  switch (period) {
    case 'all':
      return true;
    case 'day':
    case 'week':
    case 'month':
    case 'year':
      return at >= periodStart(period, now);
    default: {
      const neverPeriod: never = period;
      return neverPeriod;
    }
  }
}

export function readBlockedNames(storage: Storage): string[] {
  try {
    const raw = storage.getItem(BOARD_BLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function writeBlockedNames(storage: Storage, names: string[]): void {
  try {
    storage.setItem(BOARD_BLOCKS_KEY, JSON.stringify(names));
  } catch {
    /* the in-memory list still hides the name this session */
  }
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

function byStanding(a: { score: number; at: number }, b: { score: number; at: number }): number {
  return b.score - a.score || a.at - b.at;
}

export function formatRank(rank: number | null): string {
  if (rank == null || !Number.isFinite(rank) || rank < 1) return '—';
  return `#${Math.floor(rank).toLocaleString('en-US')}`;
}

export function createMockLeaderboard(options: {
  nickname: string;
  /** ISO alpha-2. Null or omitted means they are off the country board. */
  country?: string | null;
  storage?: Storage;
  now?: number;
}): LeaderboardService {
  const storage = options.storage ?? localStorage;
  const nickname = options.nickname;
  const country = countryByCode(options.country)?.code ?? null;
  const deviceId = loadDeviceId(storage);
  let blocked = readBlockedNames(storage);
  const reports = new Set(readList(storage, REPORTS_KEY).map((name) => name.toLowerCase()));
  let best = readBest(storage);

  const hidden = (name: string) => blocked.some((item) => item.toLowerCase() === name.toLowerCase());

  const persistSets = () => {
    writeBlockedNames(storage, blocked);
    try {
      storage.setItem(REPORTS_KEY, JSON.stringify([...reports]));
    } catch {
      /* the in-memory board still hides the name this session */
    }
  };

  const crowd = (now: number, scope: BoardScope, period: BoardPeriod): CrowdRow[] => {
    const rows: CrowdRow[] = [];
    const mine = nickname.toLowerCase();
    for (let index = 0; index < CROWD; index += 1) {
      const rowName = crowdNickname(index);
      const key = rowName.toLowerCase();
      if (key === mine || hidden(rowName)) continue;
      const at = crowdAt(index, now);
      const code = crowdCountry(index);
      if (!inPeriod(period, at, now)) continue;
      if (scope === 'country' && (country == null || code !== country)) continue;
      rows.push({ nickname: rowName, score: crowdScore(index), at, country: code });
    }
    return rows;
  };

  const placed = (score: number, scope: BoardScope, period: BoardPeriod, now: number): BoardEntry[] => {
    const at = now;
    const combined: StandingRow[] = crowd(now, scope, period).map((row) => ({ ...row, mine: false }));
    const onBoard = scope === 'world' || (scope === 'country' && country != null);
    if (onBoard) {
      combined.push({
        nickname,
        score: Math.max(0, Math.floor(score)),
        at,
        mine: true,
        country,
      });
    }
    combined.sort(byStanding);
    const countryCounts = new Map<string, number>();
    if (scope === 'world') {
      for (const row of combined) {
        if (!row.country) continue;
        countryCounts.set(row.country, (countryCounts.get(row.country) ?? 0) + 1);
      }
    }
    return combined.map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      score: row.score,
      mine: row.mine,
      country: scope === 'world' && row.country && (countryCounts.get(row.country) ?? 0) < COUNTRY_BOARD_MIN
        ? null
        : row.country,
    }));
  };

  const pageFor = (period: BoardPeriod, scope: BoardScope, score: number, limit: number, now: number): BoardPage => {
    if (scope === 'country' && country == null) return { hidden: false, rows: [] };
    const rows = placed(score, scope, period, now);
    if (scope === 'country' && rows.length < COUNTRY_BOARD_MIN) return { hidden: true, rows: [] };
    const cap = Math.max(1, Math.min(50, Math.floor(limit)));
    return { hidden: false, rows: rows.slice(0, cap) };
  };

  return {
    nickname,
    country,
    deviceId,
    revision: 0,
    subscribe() { return () => {}; },
    start() {},
    stop() {},
    startRun() {},
    rankFor(score, now = Date.now()) {
      const board = placed(score, 'world', 'all', now);
      const me = board.find((row) => row.mine);
      const rounded = Math.max(0, Math.floor(score));
      const countryRows = country ? placed(score, 'country', 'all', now) : [];
      const countryHidden = country != null && countryRows.length < COUNTRY_BOARD_MIN;
      return {
        rank: me?.rank ?? board.length,
        total: board.length,
        nickname,
        score: rounded,
        country,
        countryRank: countryHidden ? null : countryRows.find((row) => row.mine)?.rank ?? null,
        countryHidden,
      };
    },
    around(score, scope, period = 'all', now = Date.now()) {
      const rounded = Math.max(0, Math.floor(score));
      const me = { rank: 0, nickname, score: rounded, mine: true, country };
      if (scope === 'country' && !country) return { above: [], me, below: [] };
      const page = pageFor(period, scope, score, 50, now);
      if (page.hidden) return { above: [], me, below: [] };
      const board = placed(score, scope, period, now);
      const index = board.findIndex((row) => row.mine);
      if (index < 0) return { above: [], me, below: [] };
      const mine = board[index] ?? me;
      return {
        above: board.slice(Math.max(0, index - 3), index),
        me: mine,
        below: board.slice(index + 1, index + 4),
      };
    },
    top(scope, score, limit, period = 'all', now = Date.now()) {
      return pageFor(period, scope, score, limit, now).rows;
    },
    board(period, scope, score, limit = 10, now = Date.now()) {
      return pageFor(period, scope, score, limit, now);
    },
    submit(score, at = Date.now(), _run?: RunSubmit) {
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
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      reports.add(key);
      if (!hidden(trimmed)) blocked = [...blocked, trimmed];
      persistSets();
    },
    block(name) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      if (!hidden(trimmed)) blocked = [...blocked, trimmed];
      persistSets();
    },
    unblock(name) {
      const key = name.trim().toLowerCase();
      blocked = blocked.filter((item) => item.toLowerCase() !== key);
      persistSets();
    },
    blockedNames() {
      return [...blocked];
    },
    async deleteData() {
      try {
        storage.removeItem(BEST_KEY);
        storage.removeItem(REPORTS_KEY);
        storage.removeItem(BOARD_BLOCKS_KEY);
      } catch {
        /* the next install id is still minted below */
      }
      blocked = [];
      reports.clear();
      best = null;
      return true;
    },
  };
}
