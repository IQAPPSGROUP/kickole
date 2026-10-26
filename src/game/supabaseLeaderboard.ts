import { countryByCode } from './countries';
import type {
  BoardEntry,
  BoardPage,
  BoardPeriod,
  BoardScope,
  LeaderboardService,
  RankSnapshot,
  RunSubmit,
} from './leaderboard';
import { COUNTRY_BOARD_MIN, readBlockedNames, writeBlockedNames } from './leaderboard';
import { composeNickname, isBlockedPair, parseNickname, type FreePair } from './nickname';
import { kickTimesText, runChecksum } from './runProof';
import { loadDeviceId } from './nicknameStore';
import { isReportReason, type ReportReason } from './reportReasons';
import { liveRpc, type LeaderboardRpc } from './supabaseClient';

const REFRESH_MS = 10_000;
const OUTBOX_KEY = 'kicky.board.outbox.v1';
const MODERATION_KEY = 'kicky.board.pending-moderation.v1';

export type RegisterOutcome =
  | { ok: true; nickname: string; offline?: boolean }
  | { ok: false; reason: string };

export interface PeekOutcome {
  ok: boolean;
  nickname: string;
  taken: boolean;
  offline?: boolean;
  reason?: string;
}

interface RankCache {
  rank: number | null;
  total: number;
  score: number;
  countryRank: number | null;
  countryHidden: boolean;
  /** All-time world board is under {@link COUNTRY_BOARD_MIN}. Names and the count stay off the panel. */
  worldHidden: boolean;
  neighbours: BoardEntry[];
  countryNeighbours: BoardEntry[];
}

interface StoredBoard {
  around: BoardEntry[];
  page: BoardPage;
  at: number;
}

interface OutboxScore {
  deviceId: string;
  score: number;
  combo: number;
  durationMs: number;
  holdUntil: number;
  token: string;
  kickTimesMs?: number[];
}

interface PendingReport {
  nickname: string;
  reason: ReportReason;
}

interface PendingModeration {
  reports: PendingReport[];
  blocks: string[];
  unblocks: string[];
}

function sliceKey(scope: BoardScope, period: BoardPeriod): string {
  return `${scope}:${period}`;
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

function readBoardPage(data: unknown): BoardPage {
  const body = asRecord(data);
  if (body.hidden === true) return { hidden: true, rows: [] };
  return { hidden: false, rows: Array.isArray(body.rows) ? readRows(body.rows) : [] };
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
    case 'not_in_list':
      return 'Pick two words from the lists.';
    case 'rename_limit':
      return 'You can change your nickname once every 7 days.';
    case 'taken':
      return 'That nickname is taken.';
    case 'invalid_country':
      return 'Pick a country from the list.';
    case 'banned':
      return 'This device cannot join the board.';
    case 'rate_limited':
      return 'Try again in a little while.';
    case 'blocked_pair':
      return 'Those two words can\'t go together.';
    case 'device_required':
      return 'Try again in a little while.';
    default:
      return 'Pick a different nickname.';
  }
}

function permanentNicknameReason(reason: string): boolean {
  switch (reason) {
    case 'not_in_list':
    case 'invalid_country':
    case 'banned':
    case 'taken':
      return true;
    case 'rename_limit':
    case 'rate_limited':
    case 'blocked_pair':
    case 'device_required':
      return false;
    default:
      return false;
  }
}

/** Lock in two list words. A network failure still counts as saved locally (`offline`). */
export async function registerPlayer(input: {
  deviceId: string;
  adjective: string;
  noun: string;
  country: string | null;
  rpc?: LeaderboardRpc;
}): Promise<RegisterOutcome> {
  const rpc = input.rpc ?? liveRpc();
  const local = composeNickname(input.adjective, input.noun) ?? '';
  const saved = await callRpc(rpc, 'register_or_update_player', {
    device_id: input.deviceId,
    adjective: input.adjective,
    noun: input.noun,
    country: input.country,
  });
  if (saved.error) return { ok: true, offline: true, nickname: local };
  const body = asRecord(saved.data);
  if (body.ok === true) {
    const nickname = typeof body.nickname === 'string' ? body.nickname : local;
    return { ok: true, nickname };
  }
  const reason = typeof body.reason === 'string' ? body.reason : 'not_in_list';
  return { ok: false, reason };
}

/** Untaken word pairs for Shuffle and Pick one for me. Empty when the board cannot be reached. */
export async function suggestFreeNames(input: {
  deviceId: string;
  count?: number;
  adjective?: string | null;
  noun?: string | null;
  rpc?: LeaderboardRpc;
}): Promise<FreePair[]> {
  const rpc = input.rpc ?? liveRpc();
  const suggested = await callRpc(rpc, 'suggest_free_names', {
    n: input.count ?? 8,
    device_id: input.deviceId,
    adjective: input.adjective ?? null,
    noun: input.noun ?? null,
  });
  if (suggested.error) return [];
  const body = asRecord(suggested.data);
  if (body.ok !== true || !Array.isArray(body.names)) return [];
  const names: FreePair[] = [];
  for (const item of body.names) {
    const row = asRecord(item);
    if (typeof row.adjective !== 'string' || typeof row.noun !== 'string') continue;
    if (isBlockedPair(row.adjective, row.noun)) continue;
    names.push({ adjective: row.adjective, noun: row.noun });
  }
  return names;
}

/** Ask which tag this pair would get, including a Roman numeral when the pair is taken. */
export async function peekNickname(input: {
  deviceId: string;
  adjective: string;
  noun: string;
  rpc?: LeaderboardRpc;
}): Promise<PeekOutcome> {
  const rpc = input.rpc ?? liveRpc();
  const local = composeNickname(input.adjective, input.noun) ?? '';
  const peeked = await callRpc(rpc, 'peek_nickname', {
    device_id: input.deviceId,
    adjective: input.adjective,
    noun: input.noun,
  });
  if (peeked.error) return { ok: true, nickname: local, taken: false, offline: true };
  const body = asRecord(peeked.data);
  if (body.ok !== true) {
    return {
      ok: false,
      nickname: local,
      taken: false,
      reason: typeof body.reason === 'string' ? body.reason : 'not_in_list',
    };
  }
  return {
    ok: true,
    nickname: typeof body.nickname === 'string' ? body.nickname : local,
    taken: body.taken === true,
  };
}

export async function deletePlayerAccount(input: {
  deviceId: string;
  rpc?: LeaderboardRpc;
}): Promise<{ ok: true } | { ok: false; offline: true }> {
  const rpc = input.rpc ?? liveRpc();
  const removed = await callRpc(rpc, 'delete_player', { device_id: input.deviceId });
  if (removed.error) return { ok: false, offline: true };
  const body = asRecord(removed.data);
  if (body.ok === true) return { ok: true };
  return { ok: false, offline: true };
}

function readOutbox(storage: Storage): OutboxScore | null {
  try {
    const raw = storage.getItem(OUTBOX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OutboxScore>;
    if (!parsed || typeof parsed.deviceId !== 'string' || typeof parsed.score !== 'number') return null;
    if (typeof parsed.combo !== 'number' || typeof parsed.durationMs !== 'number' || typeof parsed.token !== 'string') return null;
    return {
      deviceId: parsed.deviceId,
      score: parsed.score,
      combo: parsed.combo,
      durationMs: parsed.durationMs,
      holdUntil: typeof parsed.holdUntil === 'number' ? parsed.holdUntil : 0,
      token: parsed.token,
      kickTimesMs: Array.isArray(parsed.kickTimesMs)
        ? parsed.kickTimesMs.filter((time): time is number => typeof time === 'number' && Number.isFinite(time))
        : undefined,
    };
  } catch {
    return null;
  }
}

function readReport(item: unknown): PendingReport | null {
  const row = asRecord(item);
  const nickname = typeof row.nickname === 'string' ? row.nickname.trim() : '';
  if (!nickname || !isReportReason(row.reason)) return null;
  return { nickname, reason: row.reason };
}

function readModeration(storage: Storage): PendingModeration {
  try {
    const raw = storage.getItem(MODERATION_KEY);
    if (!raw) return { reports: [], blocks: [], unblocks: [] };
    const parsed = asRecord(JSON.parse(raw) as unknown);
    const reports = Array.isArray(parsed.reports)
      ? parsed.reports.flatMap((item) => {
        const report = readReport(item);
        return report ? [report] : [];
      })
      : [];
    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks.filter((item): item is string => typeof item === 'string') : [];
    const unblocks = Array.isArray(parsed.unblocks) ? parsed.unblocks.filter((item): item is string => typeof item === 'string') : [];
    return { reports, blocks, unblocks };
  } catch {
    return { reports: [], blocks: [], unblocks: [] };
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
  let blocked = readBlockedNames(storage);
  const pending = readModeration(storage);
  const pendingReports = new Map(pending.reports.map((item) => [item.nickname.toLowerCase(), item]));
  const pendingBlocks = new Set(pending.blocks);
  const pendingUnblocks = new Set(pending.unblocks);
  let outbox = readOutbox(storage);
  if (outbox && outbox.deviceId !== deviceId) outbox = null;
  let runToken: string | null = null;

  let revision = 0;
  let generation = 0;
  let stopped = true;
  let registered = false;
  let registrationBlocked = false;
  let offline = false;
  let syncedBest = 0;
  let widgetAt = 0;
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
    writeBlockedNames(storage, blocked);
  };

  const persistOutbox = () => {
    try {
      if (outbox) storage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
      else storage.removeItem(OUTBOX_KEY);
    } catch { /* the in-memory outbox still retries this session */ }
  };

  const persistModeration = () => {
    try {
      const payload: PendingModeration = {
        reports: [...pendingReports.values()],
        blocks: [...pendingBlocks],
        unblocks: [...pendingUnblocks],
      };
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

  const rememberOutbox = (
    score: number,
    combo: number,
    durationMs: number,
    holdUntil: number,
    token: string,
    kickTimesMs?: number[],
  ) => {
    if (outbox && outbox.deviceId === deviceId && score < outbox.score) return;
    outbox = { deviceId, score, combo, durationMs, holdUntil, token, kickTimesMs };
    persistOutbox();
  };

  const ensureRegistered = async (token: number): Promise<boolean> => {
    if (registered || registrationBlocked) return registered;
    const parsed = parseNickname(nickname);
    if (!parsed) return false;
    const result = await registerPlayer({
      deviceId,
      adjective: parsed.adjective,
      noun: parsed.noun,
      country,
      rpc,
    });
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
    const rankCall = callRpc(rpc, 'get_rank', { device_id: deviceId, period: 'all' });
    const aroundCall = callRpc(rpc, 'get_around', { device_id: deviceId, period: 'all', scope: 'world', n: 3 });
    const countryCall = country
      ? callRpc(rpc, 'get_around', { device_id: deviceId, period: 'all', scope: 'country', n: 3 })
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
    const countryHidden = row.country_hidden === true;
    const reportedTotal = numberOrNull(row.total);
    const worldHidden = reportedTotal != null && reportedTotal < COUNTRY_BOARD_MIN;
    const worldNeighbours = worldHidden || aroundRes.error ? [] : neighbours;
    rankCache = {
      rank: worldHidden ? null : (hasRow ? numberOrNull(row.rank) : null),
      total: worldHidden ? 0 : (reportedTotal ?? rankCache?.total ?? 0),
      score,
      countryRank: country && !countryHidden ? numberOrNull(row.country_rank) : null,
      countryHidden,
      worldHidden,
      neighbours: worldNeighbours,
      countryNeighbours: countryHidden ? [] : countryNeighbours,
    };
    syncedBest = Math.max(syncedBest, score);
    const world = boards.get('world:all');
    boards.set('world:all', worldHidden
      ? { around: [], page: { hidden: true, rows: [] }, at: now() }
      : {
        around: worldNeighbours,
        page: world?.page ?? { hidden: false, rows: [] },
        at: world?.at ?? 0,
      });
    if (country) {
      const countryBoard = boards.get('country:all');
      boards.set('country:all', {
        around: countryNeighbours,
        page: countryHidden
          ? { hidden: true, rows: [] }
          : (countryBoard?.page ?? { hidden: false, rows: [] }),
        at: countryBoard?.at ?? 0,
      });
    }
  };

  const pullSlice = async (scope: BoardScope, period: BoardPeriod, token: number): Promise<boolean> => {
    const [aroundRes, boardRes] = await Promise.all([
      callRpc(rpc, 'get_around', { device_id: deviceId, period, scope, n: 3 }),
      callRpc(rpc, 'get_board', {
        period,
        scope,
        country: scope === 'country' ? country : null,
        lim: 10,
        device_id: deviceId,
      }),
    ]);
    if (token !== generation || stopped) return false;
    if (aroundRes.error && boardRes.error) return false;
    const key = sliceKey(scope, period);
    const previous = boards.get(key);
    const page = boardRes.error ? (previous?.page ?? { hidden: false, rows: [] }) : readBoardPage(boardRes.data);
    const worldTooSmall = scope === 'world' && period === 'all' && rankCache?.worldHidden === true;
    const hiddenPage = page.hidden || worldTooSmall;
    const around = aroundRes.error || hiddenPage
      ? (hiddenPage ? [] : (previous?.around ?? []))
      : readRows(aroundRes.data);
    boards.set(key, {
      around,
      page: hiddenPage ? { hidden: true, rows: [] } : page,
      at: now(),
    });
    if (scope === 'world' && period === 'all' && !aroundRes.error && !page.hidden && rankCache) {
      rankCache = { ...rankCache, neighbours: around };
    }
    if (scope === 'country' && period === 'all' && !aroundRes.error && rankCache) {
      rankCache = {
        ...rankCache,
        countryHidden: page.hidden,
        countryNeighbours: page.hidden ? [] : readRows(aroundRes.data),
        countryRank: page.hidden ? null : rankCache.countryRank,
      };
    }
    return true;
  };

  const flushOutbox = async (token: number): Promise<void> => {
    if (!outbox || outbox.deviceId !== deviceId || now() < outbox.holdUntil) return;
    const pendingScore = outbox;
    const kickTimesMs = pendingScore.kickTimesMs ?? [];
    const kickTimes = kickTimesText(kickTimesMs);
    const sent = await callRpc(rpc, 'submit_score', {
      device_id: deviceId,
      score: pendingScore.score,
      combo: pendingScore.combo,
      run_duration_ms: pendingScore.durationMs,
      run_token: pendingScore.token,
      kick_count: kickTimesMs.length,
      kick_times: kickTimes,
      kick_checksum: runChecksum({
        deviceId,
        token: pendingScore.token,
        score: pendingScore.score,
        kickCount: kickTimesMs.length,
        durationMs: pendingScore.durationMs,
        kickTimes,
      }),
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
    if (reason === 'implausible') {
      const stamps = kickTimesMs;
      console.debug('[kickole] score rejected', {
        reason,
        score: pendingScore.score,
        combo: pendingScore.combo,
        durationMs: pendingScore.durationMs,
        kickCount: stamps.length,
        firstKickMs: stamps.length > 0 ? stamps[0] : null,
        lastKickMs: stamps.length > 0 ? stamps[stamps.length - 1] : null,
      });
    }
    if (reason === 'implausible' || reason === 'invalid' || reason === 'invalid_token' || reason === 'banned') {
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
    for (const item of [...pendingReports.values()]) {
      const key = item.nickname.toLowerCase();
      const result = await callRpc(rpc, 'report_player', {
        reporter_device_id: deviceId,
        reported_nickname: item.nickname,
        reason: item.reason,
      });
      if (token !== generation || stopped) return;
      const body = asRecord(result.data);
      if (!result.error && (body.ok === true || body.reason === 'not_found' || body.reason === 'invalid_reason')) {
        pendingReports.delete(key);
      } else if (!result.error && body.reason === 'unknown_player') {
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
    for (const name of [...pendingUnblocks]) {
      const result = await callRpc(rpc, 'unblock_player', {
        device_id: deviceId,
        blocked_nickname: name,
      });
      if (token !== generation || stopped) return;
      const body = asRecord(result.data);
      if (!result.error && (body.ok === true || body.reason === 'not_found')) pendingUnblocks.delete(name);
      else if (!result.error && body.reason === 'unknown_player') {
        registered = false;
        await ensureRegistered(token);
      }
    }
    persistModeration();
  };

  const refreshOpenBoards = async (token: number) => {
    await pullWidget(token, true);
    await pullSlice('world', 'all', token);
    if (country) await pullSlice('country', 'all', token);
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

  const requestSlice = (scope: BoardScope, period: BoardPeriod, force: boolean) => {
    if (stopped) return;
    const key = sliceKey(scope, period);
    const cached = boards.get(key);
    if (!force && cached && cached.at > 0 && now() - cached.at < REFRESH_MS) return;
    const token = generation;
    enqueue(async () => {
      if (token !== generation || stopped) return;
      const ok = await pullSlice(scope, period, token);
      if (token !== generation || stopped) return;
      if (!ok) {
        offline = true;
        scheduleRetry();
      }
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
    countryHidden: false,
    worldHidden: false,
  });

  const isHidden = (name: string) => blocked.some((item) => item.toLowerCase() === name.toLowerCase());

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
    startRun() {
      const token = generation;
      enqueue(async () => {
        if (token !== generation || stopped) return;
        const res = await callRpc(rpc, 'start_run', { device_id: deviceId });
        if (token !== generation || stopped) return;
        const body = asRecord(res.data);
        runToken = !res.error && body.ok === true && typeof body.token === 'string' ? body.token : null;
      });
    },
    rankFor(score) {
      const live = Math.max(0, Math.floor(score));
      lastLive = live;
      requestWidget(false);
      if (!rankCache) return blankRank(live);
      const worldHidden = rankCache.worldHidden;
      return {
        rank: worldHidden ? null : climbed(rankCache.rank, rankCache.score, live, rankCache.neighbours),
        total: worldHidden ? 0 : rankCache.total,
        nickname,
        score: live,
        country,
        countryHidden: rankCache.countryHidden,
        worldHidden,
        countryRank: country && !rankCache.countryHidden
          ? climbed(
            rankCache.countryRank,
            rankCache.countryNeighbours.find((row) => row.mine)?.score ?? rankCache.score,
            live,
            rankCache.countryNeighbours,
          )
          : null,
      };
    },
    around(score, scope, period = 'all') {
      const rounded = Math.max(0, Math.floor(score));
      const me = { rank: 0, nickname, score: rounded, mine: true, country };
      if (scope === 'country' && !country) return { above: [], me, below: [] };
      requestSlice(scope, period, false);
      const cached = boards.get(sliceKey(scope, period));
      const worldTooSmall = scope === 'world' && period === 'all' && rankCache?.worldHidden === true;
      if (worldTooSmall || !cached || cached.page.hidden || cached.around.length === 0) return { above: [], me, below: [] };
      const rows = cached.around.filter((row) => row.mine || !isHidden(row.nickname));
      const serverMe = rows.find((row) => row.mine);
      const baseRank = serverMe?.rank ?? (scope === 'world' && period === 'all' ? rankCache?.rank ?? null : null);
      const baseScore = serverMe?.score ?? 0;
      const myRank = climbed(baseRank, baseScore, rounded, rows) ?? 0;
      const others = rows.filter((row) => !row.mine);
      return {
        above: others.filter((row) => row.rank < myRank).sort((a, b) => a.rank - b.rank).slice(-3),
        me: { ...me, rank: myRank, score: Math.max(baseScore, rounded) },
        below: others.filter((row) => row.rank >= myRank).sort((a, b) => a.rank - b.rank).slice(0, 3),
      };
    },
    top(scope, score, limit, period = 'all') {
      return this.board(period, scope, score, limit).rows;
    },
    board(period, scope, _score, limit = 10) {
      if (scope === 'country' && !country) return { hidden: false, rows: [] };
      requestSlice(scope, period, false);
      const cached = boards.get(sliceKey(scope, period));
      if (!cached) return { hidden: false, rows: [] };
      if (cached.page.hidden || (scope === 'world' && period === 'all' && rankCache?.worldHidden === true)) {
        return { hidden: true, rows: [] };
      }
      const cap = Math.max(1, Math.min(50, Math.floor(limit)));
      return {
        hidden: false,
        rows: cached.page.rows.filter((row) => row.mine || !isHidden(row.nickname)).slice(0, cap),
      };
    },
    submit(score, at = now(), run?: RunSubmit) {
      const rounded = Math.floor(score);
      const combo = Math.max(0, Math.floor(run?.combo ?? 0));
      const durationMs = Math.max(0, Math.floor(run?.durationMs ?? 0));
      const kickTimesMs = run?.kickTimesMs?.map((time) => Math.max(0, Math.floor(time)));
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
      const token = generation;
      enqueue(async () => {
        if (!runToken) return;
        rememberOutbox(rounded, combo, durationMs, 0, runToken, kickTimesMs);
        await flushOutbox(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        await refreshOpenBoards(token);
        if (token !== generation || stopped) return;
        publish();
      });
      const accepted = rounded > known;
      return { accepted, best: accepted ? rounded : known };
    },
    report(name, reason) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!isReportReason(reason) || !key || key === nickname.toLowerCase()) return;
      if (!isHidden(trimmed)) blocked = [...blocked, trimmed];
      pendingReports.set(key, { nickname: trimmed, reason });
      persistHidden();
      persistModeration();
      publish();
      const token = generation;
      enqueue(async () => {
        await flushModeration(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        await refreshOpenBoards(token);
        if (token === generation && !stopped) publish();
      });
    },
    block(name) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key || key === nickname.toLowerCase()) return;
      if (!isHidden(trimmed)) blocked = [...blocked, trimmed];
      pendingBlocks.add(trimmed);
      persistHidden();
      persistModeration();
      publish();
      const token = generation;
      enqueue(async () => {
        await flushModeration(token);
        if (token !== generation || stopped) return;
        widgetAt = 0;
        await refreshOpenBoards(token);
        if (token === generation && !stopped) publish();
      });
    },
    unblock(name) {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      if (!key) return;
      blocked = blocked.filter((item) => item.toLowerCase() !== key);
      pendingBlocks.delete(trimmed);
      pendingUnblocks.add(trimmed);
      persistHidden();
      persistModeration();
      publish();
      const token = generation;
      enqueue(async () => {
        await flushModeration(token);
        if (token === generation && !stopped) publish();
      });
    },
    blockedNames() {
      return [...blocked];
    },
    async deleteData() {
      const removed = await deletePlayerAccount({ deviceId, rpc });
      return removed.ok;
    },
  };

  return service;
}
