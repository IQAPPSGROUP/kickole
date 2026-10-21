import { countryByCode } from './countries';
import type {
  BoardEntry,
  BoardScope,
  LeaderboardService,
  RankSnapshot,
  RunSubmit,
} from './leaderboard';
import { loadDeviceId } from './nicknameStore';
import { liveRpc, type LeaderboardRpc } from './supabaseClient';

const REFRESH_MS = 10_000;
const BLOCKS_KEY = 'kicky.board.blocks.v1';
const OUTBOX_KEY = 'kicky.board.outbox.v1';
const MODERATION_KEY = 'kicky.board.pending-moderation.v1';

export type RegisterOutcome =
  | { ok: true; offline?: boolean }
  | { ok: false; reason: string };

interface RankCache {
  rank: number | null;
  total: number;
  score: number;
  countryRank: number | null;
  neighbours: BoardEntry[];
  countryNeighbours: BoardEntry[];
}

interface StoredBoard {
  around: BoardEntry[];
  top: BoardEntry[];
}

interface OutboxScore {
  deviceId: string;
  score: number;
  combo: number;
  durationMs: number;
  holdUntil: number;
}

interface PendingModeration {
  reports: string[];
  blocks: string[];
}

type ServerScope = 'world' | 'country';
type ServerPeriod = 'all' | 'week';

function queryFor(scope: BoardScope): { scope: ServerScope; period: ServerPeriod } {
  switch (scope) {
    case 'world':
      return { scope: 'world', period: 'all' };
    case 'week':
      return { scope: 'world', period: 'week' };
    case 'country':
      return { scope: 'country', period: 'all' };
    default: {
      const neverScope: never = scope;
      return neverScope;
    }
  }
}

function boardKey(scope: BoardScope): string {
  const query = queryFor(scope);
  return `${query.scope}:${query.period}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function countryCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return countryByCode(value.trim())?.code ?? null;
}

function readRows(data: unknown): BoardEntry[] {
  if (!Array.isArray(data)) return [];
  const rows: BoardEntry[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const rank = numberOrNull(row.rank);
    const score = numberOrNull(row.score);
    if (rank == null || score == null || typeof row.nickname !== 'string') continue;
    rows.push({
      rank,
      nickname: row.nickname,
      score,
      country: countryCode(row.country),
      mine: row.mine === true,
    });
  }
  return rows;
}

async function callRpc(
  rpc: LeaderboardRpc,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const result = await rpc.rpc(fn, args);
    if (result.error) return { data: null, error: result.error.message || 'offline' };
    return { data: result.data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'offline' };
  }
}

export function serverNicknameMessage(reason: string): string {
  switch (reason) {
    case 'length':
      return 'Use 3 to 16 characters.';
    case 'charset':
      return 'Letters, numbers and underscore only.';
    case 'looks_like_phone':
      return 'That looks like a phone number.';
    case 'blocked_word':
      return 'Pick a different nickname.';
    case 'taken':
      return 'That nickname is taken.';
    case 'invalid_country':
      return 'Pick a country from the list.';
    default:
      return 'Pick a different nickname.';
  }
}

function permanentNicknameReason(reason: string): boolean {
  switch (reason) {
    case 'length':
    case 'charset':
    case 'looks_like_phone':
    case 'blocked_word':
    case 'taken':
    case 'invalid_country':
      return true;
    default:
      return false;
  }
}

/** Lock in a nickname. A network failure still counts as saved locally (`offline`). */
export async function registerPlayer(input: {
  deviceId: string;
  nickname: string;
  country: string | null;
  rpc?: LeaderboardRpc;
}): Promise<RegisterOutcome> {
  const rpc = input.rpc ?? liveRpc();
  const checked = await callRpc(rpc, 'check_nickname', {
    nickname: input.nickname,
    device_id: input.deviceId,
  });
  if (checked.error) return { ok: true, offline: true };
  const checkBody = asRecord(checked.data);
  if (checkBody.ok !== true) {
    const reason = typeof checkBody.reason === 'string' ? checkBody.reason : 'blocked_word';
    return { ok: false, reason };
  }
  const saved = await callRpc(rpc, 'register_or_update_player', {
    device_id: input.deviceId,
    nickname: input.nickname,
    country: input.country,
  });
  if (saved.error) return { ok: true, offline: true };
  const body = asRecord(saved.data);
  if (body.ok === true) return { ok: true };
  const reason = typeof body.reason === 'string' ? body.reason : 'blocked_word';
  return { ok: false, reason };
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

function readOutbox(storage: Storage): OutboxScore | null {
  try {
    const raw = storage.getItem(OUTBOX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OutboxScore>;
    if (!parsed || typeof parsed.deviceId !== 'string' || typeof parsed.score !== 'number') return null;
    if (typeof parsed.combo !== 'number' || typeof parsed.durationMs !== 'number') return null;
    return {
      deviceId: parsed.deviceId,
      score: parsed.score,
      combo: parsed.combo,
      durationMs: parsed.durationMs,
      holdUntil: typeof parsed.holdUntil === 'number' ? parsed.holdUntil : 0,
    };
  } catch {
    return null;
  }
}

function readModeration(storage: Storage): PendingModeration {
  try {
    const raw = storage.getItem(MODERATION_KEY);
    if (!raw) return { reports: [], blocks: [] };
    const parsed = asRecord(JSON.parse(raw) as unknown);
    const reports = Array.isArray(parsed.reports) ? parsed.reports.filter((item): item is string => typeof item === 'string') : [];
    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks.filter((item): item is string => typeof item === 'string') : [];
    return { reports, blocks };
  } catch {
    return { reports: [], blocks: [] };
  }
}

function climbed(baseRank: number | null, baseScore: number, live: number, rows: BoardEntry[]): number | null {
  if (baseRank == null) return null;
  let rank = baseRank;
  for (const row of rows) {
    if (row.mine) continue;
    if (row.rank < rank && row.score < live && row.score >= baseScore) rank = row.rank;
  }
  return rank;
}

function passedWindow(baseRank: number | null, live: number, rows: BoardEntry[]): boolean {
  if (baseRank == null) return false;
  const above = rows.filter((row) => !row.mine && row.rank < baseRank);
  if (above.length === 0) return false;
  return live > Math.max(...above.map((row) => row.score));
}

function nextUtcMidnight(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function createSupabaseLeaderboard(options: {
  nickname: string;
  country?: string | null;
  storage?: Storage;
  rpc?: LeaderboardRpc;
  now?: () => number;
  deviceId?: string;
}): LeaderboardService {
  const storage = options.storage ?? localStorage;
  const rpc = options.rpc ?? liveRpc();
  const now = options.now ?? (() => Date.now());
  const nickname = options.nickname;
  const country = countryByCode(options.country)?.code ?? null;
  const deviceId = options.deviceId ?? loadDeviceId(storage);
  const hidden = new Set(readList(storage, BLOCKS_KEY).map((name) => name.toLowerCase()));
  const pending = readModeration(storage);
  const pendingReports = new Set(pending.reports);
  const pendingBlocks = new Set(pending.blocks);
  let outbox = readOutbox(storage);
  if (outbox && outbox.deviceId !== deviceId) outbox = null;

  let revision = 0;
  let generation = 0;
  let stopped = true;
  let registered = false;
  let registrationBlocked = false;
  let offline = false;
  let syncedBest = 0;
  let widgetAt = 0;
  let boardAt = 0;
  let lastLive = 0;
  let lastSubmitKey = '';
  let lastSubmitAt = 0;
  let rankCache: RankCache | null = null;
  const boards = new Map<string, StoredBoard>();
  const listeners = new Set<() => void>();
  let chain: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let widgetQueued = false;

  const publish = () => {
    revision += 1;
    for (const listener of [...listeners]) listener();
  };

  const persistHidden = () => {
    try { storage.setItem(BLOCKS_KEY, JSON.stringify([...hidden])); } catch { /* session memory still hides the name */ }
  };

  const persistOutbox = () => {
    try {
      if (outbox) storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      else storage.removeItem(OUTBOX_KEY);
    } catch { /* the in-memory outbox still retries this session */ }
  };

  const persistModeration = () => {
    try {
      const payload: PendingModeration = { reports: [...pendingReports], blocks: [...pendingBlocks] };
      storage.setItem(MODERATION_KEY, JSON.stringify(payload));
    } catch { /* retry stays in memory */ }
  };

  const enqueue = (task: () => Promise<void>) => {
    chain = chain.then(task, task);
  };

  const scheduleRetry = (wait = REFRESH_MS) => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (!stopped) requestCycle();
    }, Math.max(0, wait));
  };

  const rememberOutbox = (score: number, combo: number, durationMs: number, holdUntil: number) => {
    if (outbox && outbox.deviceId === deviceId && score < outbox.score) return;
    outbox = { deviceId, score, combo, durationMs, holdUntil };
    persistOutbox();
  };

  const ensureRegistered = async (token: number): Promise<boolean> => {
    if (registered || registrationBlocked) return registered;
    const result = await registerPlayer({ deviceId, nickname, country, rpc });
    if (token !== generation || stopped) return false;
    if (result.ok) {
      registered = !result.offline;
      if (result.offline) {
        offline = true;
        scheduleRetry();
      }
      return true;
    }
    if (permanentNicknameReason(result.reason)) registrationBlocked = true;
    else scheduleRetry();
    return false;
  };

  const pullWidget = async (token: number, force: boolean): Promise<void> => {
    if (!force && widgetAt && now() - widgetAt < REFRESH_MS) return;
    widgetAt = now();
    const rankCall = callRpc(rpc, 'get_rank', { device_id: deviceId, scope: 'world', period: 'all' });
    const aroundCall = callRpc(rpc, 'get_around', { device_id: deviceId, scope: 'world', period: 'all', n: 3 });
    const countryCall = country
      ? callRpc(rpc, 'get_around', { device_id: deviceId, scope: 'country', period: 'all', n: 3 })
      : null;
    const [rankRes, aroundRes, countryRes] = await Promise.all([rankCall, aroundCall, countryCall]);
    if (token !== generation || stopped) return;
    if (rankRes.error) {
      offline = true;
      scheduleRetry();
      return;
    }
    offline = false;
    const row = Array.isArray(rankRes.data) ? asRecord(rankRes.data[0]) : asRecord(rankRes.data);
    const hasRow = Array.isArray(rankRes.data) ? rankRes.data.length > 0 : Object.keys(row).length > 0;
    const neighbours = aroundRes.error ? (rankCache?.neighbours ?? []) : readRows(aroundRes.data);
    const countryNeighbours = !countryRes || countryRes.error
      ? (rankCache?.countryNeighbours ?? [])
      : readRows(countryRes.data);
    const score = numberOrNull(row.score) ?? 0;
    rankCache = {
      rank: hasRow ? numberOrNull(row.rank) : null,
      total: numberOrNull(row.total) ?? rankCache?.total ?? 0,
      score,
      countryRank: country ? numberOrNull(row.country_rank) : null,
      neighbours,
      countryNeighbours,
    };
    syncedBest = Math.max(syncedBest, score);
    const world = boards.get('world:all');
    boards.set('world:all', { around: neighbours, top: world?.top ?? [] });
    if (country) {
      const countryBoard = boards.get('country:all');
      boards.set('country:all', { around: countryNeighbours, top: countryBoard?.top ?? [] });
    }
  };

  const pullScope = async (scope: ServerScope, period: ServerPeriod, token: number): Promise<boolean> => {
    const [aroundRes, topRes] = await Promise.all([
      callRpc(rpc, 'get_around', { device_id: deviceId, scope, period, n: 3 }),
      callRpc(rpc, 'get_top', {
        scope,
        country_code: scope === 'country' ? country : null,
        period,
        lim: 10,
        device_id: deviceId,
      }),
    ]);
    if (token !== generation || stopped) return false;
    if (aroundRes.error && topRes.error) return false;
    const key = `${scope}:${period}`;
    const previous = boards.get(key);
    boards.set(key, {
      around: aroundRes.error ? (previous?.around ?? []) : readRows(aroundRes.data),
      top: topRes.error ? (previous?.top ?? []) : readRows(topRes.data),
    });
    if (scope === 'world' && period === 'all' && !aroundRes.error && rankCache) {
      rankCache = { ...rankCache, neighbours: readRows(aroundRes.data) };
    }
    if (scope === 'country' && period === 'all' && !aroundRes.error && rankCache) {
      rankCache = { ...rankCache, countryNeighbours: readRows(aroundRes.data) };
    }
    return true;
  };

  const pullBoard = async (token: number, force: boolean): Promise<void> => {
    if (!force && boardAt && now() - boardAt < REFRESH_MS) return;
    boardAt = now();
    const jobs = [
      pullScope('world', 'all', token),
      pullScope('world', 'week', token),
    ];
    if (country) jobs.push(pullScope('country', 'all', token));
    const results = await Promise.all(jobs);
    if (token !== generation || stopped) return;
    if (results.every((ok) => !ok)) {
      offline = true;
      scheduleRetry();
      return;
    }
    offline = false;
  };

  const flushOutbox = async (token: number): Promise<void> => {
    if (!outbox || outbox.deviceId !== deviceId || now() < outbox.holdUntil) return;
    const pendingScore = outbox;
    const sent = await callRpc(rpc, 'submit_score', {
      device_id: deviceId,
      score: pendingScore.score,
      combo: pendingScore.combo,
      run_duration_ms: pendingScore.durationMs,
    });
    if (token !== generation || stopped) return;
    if (sent.error) {
      pendingScore.holdUntil = now() + REFRESH_MS;
      outbox = pendingScore;
      persistOutbox();
      offline = true;
      scheduleRetry();
      return;
    }
    const body = asRecord(sent.data);
    if (body.accepted === true) {
      const best = numberOrNull(body.best);
      if (best != null) syncedBest = Math.max(syncedBest, best);
      if (outbox && outbox.score <= pendingScore.score) outbox = null;
      persistOutbox();
      offline = false;
      return;
    }
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (reason === 'implausible' || reason === 'invalid') {
      if (outbox && outbox.score === pendingScore.score) outbox = null;
      persistOutbox();
      return;
    }
    if (reason === 'unknown_player') {
      registered = false;
      pendingScore.holdUntil = now() + REFRESH_MS;
      outbox = pendingScore;
      persistOutbox();
      await ensureRegistered(token);
      return;
    }
    pendingScore.holdUntil = reason === 'daily_limit' ? nextUtcMidnight(now()) : now() + REFRESH_MS;
    outbox = pendingScore;
    persistOutbox();
    if (reason === 'rate_limited') scheduleRetry();
  };

  const flushModeration = async (token: number): Promise<void> => {
    for (const name of [...pendingReports]) {
      const result = await callRpc(rpc, 'report_player', {
        reporter_device_id: deviceId,
        reported_nickname: name,
        reason: 'player_report',
      });
      if (token !== generation || stopped) return;
      const body = asRecord(result.data);
      if (!result.error && (body.ok === true || body.reason === 'not_found')) pendingReports.delete(name);
      else if (!result.error && body.reason === 'unknown_player') {
        registered = false;
        await ensureRegistered(token);
      }
    }
    for (const name of [...pendingBlocks]) {
      const result = await callRpc(rpc, 'block_player', {
        device_id: deviceId,
        blocked_nickname: name,
      });
      if (token !== generation || stopped) return;
      const body = asRecord(result.data);
      if (!result.error && (body.ok === true || body.reason === 'not_found')) pendingBlocks.delete(name);
      else if (!result.error && body.reason === 'unknown_player') {
        registered = false;
        await ensureRegistered(token);
      }
    }
    persistModeration();
  };

  const requestCycle = () => {
    const token = generation;
    enqueue(async () => {
      if (token !== generation || stopped) return;
      await ensureRegistered(token);
      if (token !== generation || stopped) return;
      await pullWidget(token, true);
      if (token !== generation || stopped) return;
      await flushOutbox(token);
      if (token !== generation || stopped) return;
      await flushModeration(token);
      if (token !== generation || stopped) return;
      publish();
    });
  };

  const requestWidget = (force: boolean) => {
    if (stopped || widgetQueued) return;
    const age = widgetAt === 0 ? Number.POSITIVE_INFINITY : now() - widgetAt;
    const climb = passedWindow(rankCache?.rank ?? null, lastLive, rankCache?.neighbours ?? []);
    const due = widgetAt === 0 || (offline && age >= REFRESH_MS) || (climb && age >= REFRESH_MS);
    if (!force && !due) return;
    if (!force && age < REFRESH_MS) return;
    widgetQueued = true;
    const token = generation;
    enqueue(async () => {
      widgetQueued = false;
      if (token !== generation || stopped) return;
      await pullWidget(token, force);
      if (token !== generation || stopped) return;
      publish();
    });
  };

  const requestBoard = (force: boolean) => {
    if (stopped) return;
    if (!force && boardAt && now() - boardAt < REFRESH_MS) return;
    const token = generation;
    enqueue(async () => {
      if (token !== generation || stopped) return;
      await pullBoard(token, force);
      if (token !== generation || stopped) return;
      publish();
    });
  };

  const blankRank = (score: number): RankSnapshot => ({
    rank: null,
    total: rankCache?.total ?? 0,
    nickname,
    score,
    country,
    countryRank: null,
  });

  const service: LeaderboardService = {
    nickname,
    country,
    deviceId,
    get revision() { return revision; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      stopped = false;
      generation += 1;
      requestCycle();
    },
    stop() {
      stopped = true;
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    rankFor(score) {
      const live = Math.max(0, Math.floor(score));
      lastLive = live;
      requestWidget(false);
      if (!rankCache) return blankRank(live);
      return {
        rank: climbed(rankCache.rank, rankCache.score, live, rankCache.neighbours),
        total: rankCache.total,
        nickname,
        score: live,
        country,
        countryRank: country
          ? climbed(
            rankCache.countryRank,
            rankCache.countryNeighbours.find((row) => row.mine)?.score ?? rankCache.score,
            live,
            rankCache.countryNeighbours,
          )
          : null,
      };
    },
    around(score, scope) {
      const rounded = Math.max(0, Math.floor(score));
      const me = { rank: 0, nickname, score: rounded, mine: true, country };
      if (scope === 'country' && !country) return { above: [], me, below: [] };
      requestBoard(false);
      const cached = boards.get(boardKey(scope));
      if (!cached || cached.around.length === 0) return { above: [], me, below: [] };
      const rows = cached.around.filter((row) => row.mine || !hidden.has(row.nickname.toLowerCase()));
      const serverMe = rows.find((row) => row.mine);
      const baseRank = serverMe?.rank ?? (scope === 'world' ? rankCache?.rank ?? null : null);
      const baseScore = serverMe?.score ?? 0;
      const myRank = climbed(baseRank, baseScore, rounded, rows) ?? 0;
      const others = rows.filter((row) => !row.mine);
      return {
        above: others.filter((row) => row.score > rounded).sort((a, b) => a.rank - b.rank).slice(-3),
        me: { ...me, rank: myRank },
        below: others.filter((row) => row.score <= rounded).sort((a, b) => a.rank - b.rank).slice(0, 3),
      };
    },
    top(scope, _score, limit) {
      if (scope === 'country' && !country) return [];
      requestBoard(false);
      const cached = boards.get(boardKey(scope));
      if (!cached) return [];
      const cap = Math.max(1, Math.min(50, Math.floor(limit)));
      return cached.top
        .filter((row) => row.mine || !hidden.has(row.nickname.toLowerCase()))
        .slice(0, cap);
    },
    submit(score, at = now(), run?: RunSubmit) {
      const rounded = Math.floor(score);
      const combo = Math.max(0, Math.floor(run?.combo ?? 0));
      const durationMs = Math.max(0, Math.floor(run?.durationMs ?? 0));
      const known = Math.max(syncedBest, outbox?.score ?? 0);
      if (!Number.isFinite(score) || rounded <= 0 || durationMs <= 0) {
        return { accepted: false, best: known };
      }
      const key = `${rounded}:${combo}:${durationMs}`;
      if (key === lastSubmitKey && now() - lastSubmitAt < 2000) {
        return { accepted: rounded > known, best: rounded > known ? rounded : known };
      }
      lastSubmitKey = key;
      lastSubmitAt = at;
      rememberOutbox(rounded, combo, durationMs, 0);
      const token = generation;
      enqueue(async () => {
        await flushOutbox(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        boardAt = 0;
        await pullWidget(token, true);
        await pullBoard(token, true);
        if (token !== generation || stopped) return;
        publish();
      });
      const accepted = rounded > known;
      return { accepted, best: accepted ? rounded : known };
    },
    report(name) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      hidden.add(key);
      pendingReports.add(trimmed);
      persistHidden();
      persistModeration();
      publish();
      const token = generation;
      enqueue(async () => {
        await flushModeration(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        boardAt = 0;
        await pullWidget(token, true);
        await pullBoard(token, true);
        if (token === generation && !stopped) publish();
      });
    },
    block(name) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      hidden.add(key);
      pendingBlocks.add(trimmed);
      persistHidden();
      persistModeration();
      publish();
      const token = generation;
      enqueue(async () => {
        await flushModeration(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        boardAt = 0;
        await pullWidget(token, true);
        await pullBoard(token, true);
        if (token === generation && !stopped) publish();
      });
    },
  };

  return service;
}
