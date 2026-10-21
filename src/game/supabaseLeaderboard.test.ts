import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatRank } from './leaderboard';
import { runChecksum } from './runProof';
import type { LeaderboardRpc } from './supabaseClient';
import { createSupabaseLeaderboard, peekNickname, registerPlayer, serverNicknameMessage, suggestFreeNames } from './supabaseLeaderboard';

const DEVICE = '11111111-1111-4111-8111-111111111111';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

type Handler = (args: Record<string, unknown>) => { data: unknown } | { error: string };

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

function scripted(handlers: Record<string, Handler>) {
  const calls: RpcCall[] = [];
  const rpc: LeaderboardRpc = {
    rpc(fn, args = {}) {
      calls.push({ fn, args });
      const handler = handlers[fn];
      if (!handler) return Promise.resolve({ data: null, error: { message: `unexpected ${fn}` } });
      const result = handler(args);
      if ('error' in result) return Promise.resolve({ data: null, error: { message: result.error } });
      return Promise.resolve({ data: result.data, error: null });
    },
  };
  return { calls, rpc };
}

const NICK = 'Turbo Striker';

const rankRow = {
  rank: 4,
  total: 20,
  nickname: NICK,
  score: 10,
  country: 'GB',
  country_rank: 2,
  country_total: 5,
  country_hidden: false,
};

const aroundRows = [
  { rank: 2, nickname: 'HighKick', country: 'FR', score: 100, mine: false },
  { rank: 3, nickname: 'MidKick', country: 'GB', score: 50, mine: false },
  { rank: 4, nickname: NICK, country: 'GB', score: 10, mine: true },
  { rank: 5, nickname: 'LowKick', country: 'DE', score: 5, mine: false },
];

function liveHandlers(extra: Record<string, Handler> = {}): Record<string, Handler> {
  return {
    peek_nickname: () => ({ data: { ok: true, nickname: NICK, taken: false } }),
    register_or_update_player: () => ({ data: { ok: true, nickname: NICK, country: 'GB' } }),
    start_run: () => ({ data: { ok: true, token: '22222222-2222-4222-8222-222222222222' } }),
    get_rank: () => ({ data: [rankRow] }),
    get_around: (args) => ({ data: args.period === 'week' ? aroundRows.map((row) => ({ ...row, rank: row.rank + 1 })) : aroundRows }),
    get_board: () => ({ data: { hidden: false, rows: aroundRows.slice(0, 3).map((row) => ({ ...row, mine: false })) } }),
    submit_score: () => ({ data: { accepted: true, best: 30, week_best: 30, new_best: true, new_week_best: true } }),
    report_player: () => ({ data: { ok: true } }),
    block_player: () => ({ data: { ok: true } }),
    ...extra,
  };
}

describe('supabase leaderboard', () => {
  const open: { stop: () => void }[] = [];
  afterEach(() => {
    for (const board of open) board.stop();
    open.length = 0;
  });

  it('shows a server reason when the nickname is taken', async () => {
    const { calls, rpc } = scripted({
      register_or_update_player: () => ({ data: { ok: false, reason: 'taken' } }),
    });
    const result = await registerPlayer({
      deviceId: DEVICE,
      adjective: 'Turbo',
      noun: 'Striker',
      country: 'GB',
      rpc,
    });
    expect(result).toEqual({ ok: false, reason: 'taken' });
    expect(serverNicknameMessage('taken')).toBe('That nickname is taken.');
    expect(serverNicknameMessage('rename_limit')).toBe('You can change your nickname once every 7 days.');
    expect(calls.map((call) => call.fn)).toEqual(['register_or_update_player']);
    expect(calls[0]?.args).toMatchObject({ adjective: 'Turbo', noun: 'Striker' });
  });

  it('asks for untaken pairs and skips a bad payload', async () => {
    const { calls, rpc } = scripted({
      suggest_free_names: (args) => ({
        data: {
          ok: true,
          names: [
            { adjective: 'Neon', noun: 'Falcon' },
            { adjective: 1, noun: 'Wolf' },
            { adjective: 'Golden', noun: 'Wolf' },
          ],
        },
        echo: args,
      }),
    });
    const names = await suggestFreeNames({
      deviceId: DEVICE,
      count: 8,
      adjective: 'Neon',
      noun: null,
      rpc,
    });
    expect(names).toEqual([
      { adjective: 'Neon', noun: 'Falcon' },
      { adjective: 'Golden', noun: 'Wolf' },
    ]);
    expect(calls[0]?.args).toMatchObject({ n: 8, device_id: DEVICE, adjective: 'Neon', noun: null });
    const offline = await suggestFreeNames({
      deviceId: DEVICE,
      rpc: scripted({ suggest_free_names: () => ({ error: 'offline' }) }).rpc,
    });
    expect(offline).toEqual([]);
  });

  it('offers the Roman suffix when the pair is taken', async () => {
    const { rpc } = scripted({
      peek_nickname: () => ({ data: { ok: true, nickname: 'Turbo Striker II', taken: true } }),
    });
    const result = await peekNickname({
      deviceId: DEVICE,
      adjective: 'Turbo',
      noun: 'Striker',
      rpc,
    });
    expect(result).toMatchObject({ ok: true, nickname: 'Turbo Striker II', taken: true });
  });

  it('keeps the nickname locally when the board cannot be reached', async () => {
    const { rpc } = scripted({
      register_or_update_player: () => ({ error: 'offline' }),
    });
    const result = await registerPlayer({
      deviceId: DEVICE,
      adjective: 'Turbo',
      noun: 'Striker',
      country: null,
      rpc,
    });
    expect(result).toEqual({ ok: true, offline: true, nickname: 'Turbo Striker' });
  });

  it('climbs past cached neighbours and waits 10s before asking again', async () => {
    let clock = 1_000_000;
    const { calls, rpc } = scripted(liveHandlers());
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: 'GB',
      storage: memory(),
      rpc,
      deviceId: DEVICE,
      now: () => clock,
    });
    open.push(board);
    board.start();
    await vi.waitFor(() => expect(board.rankFor(0).rank).toBe(4));
    const firstRankCalls = calls.filter((call) => call.fn === 'get_rank').length;
    expect(board.rankFor(60).rank).toBe(3);
    expect(board.rankFor(101).rank).toBe(2);
    const standing = board.around(0, 'world');
    expect(standing.me.rank).toBe(4);
    expect(standing.me.score).toBe(10);
    expect(standing.me.country).toBeNull();
    expect([...standing.above, ...standing.below].every((row) => row.country == null)).toBe(true);
    expect(standing.above.map((row) => row.nickname)).toEqual(['HighKick', 'MidKick']);
    expect(standing.below.map((row) => row.nickname)).toEqual(['LowKick']);
    expect(board.rankFor(0).countryRank).toBe(2);
    expect(calls.filter((call) => call.fn === 'get_rank')).toHaveLength(firstRankCalls);

    clock += 5_000;
    board.rankFor(500);
    await Promise.resolve();
    expect(calls.filter((call) => call.fn === 'get_rank')).toHaveLength(firstRankCalls);

    clock += 6_000;
    board.rankFor(500);
    await vi.waitFor(() => expect(calls.filter((call) => call.fn === 'get_rank').length).toBeGreaterThan(firstRankCalls));
  });

  it('shows a dash when the rank request fails and queues the best score', async () => {
    let clock = 5_000_000;
    let submitFails = true;
    const storage = memory();
    const { calls, rpc } = scripted(liveHandlers({
      get_rank: () => ({ error: 'offline' }),
      get_around: () => ({ error: 'offline' }),
      submit_score: () => (submitFails ? { error: 'offline' } : { data: { accepted: true, best: 30, week_best: 30, new_best: true, new_week_best: true } }),
    }));
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: 'GB',
      storage,
      rpc,
      deviceId: DEVICE,
      now: () => clock,
    });
    open.push(board);
    board.start();
    await vi.waitFor(() => expect(board.revision).toBeGreaterThan(0));
    expect(board.rankFor(12).rank).toBeNull();
    expect(formatRank(board.rankFor(12).rank)).toBe('—');

    board.startRun();
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'start_run')).toBe(true));
    expect(board.submit(30, clock, { combo: 2, durationMs: 8_000, kickTimesMs: [120, 480] })).toEqual({ accepted: true, best: 30 });
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'submit_score')).toBe(true));
    const sent = calls.filter((call) => call.fn === 'submit_score');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.args).toMatchObject({
      device_id: DEVICE,
      score: 30,
      combo: 2,
      run_duration_ms: 8_000,
      run_token: '22222222-2222-4222-8222-222222222222',
      kick_count: 2,
      kick_times: '120,480',
      kick_checksum: runChecksum({
        deviceId: DEVICE,
        token: '22222222-2222-4222-8222-222222222222',
        score: 30,
        kickCount: 2,
        durationMs: 8_000,
        kickTimes: '120,480',
      }),
    });
    expect(storage.getItem('kicky.board.outbox.v1')).toContain('"score":30');

    board.submit(30, clock + 10, { combo: 2, durationMs: 8_000 });
    await Promise.resolve();
    expect(calls.filter((call) => call.fn === 'submit_score')).toHaveLength(1);

    submitFails = false;
    clock += 11_000;
    board.start();
    await vi.waitFor(() => expect(calls.filter((call) => call.fn === 'submit_score').length).toBeGreaterThan(1));
    await vi.waitFor(() => expect(storage.getItem('kicky.board.outbox.v1')).toBeNull());
  });

  it('asks for the ISO week and hides a reported or blocked nickname', async () => {
    const { calls, rpc } = scripted(liveHandlers());
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: 'GB',
      storage: memory(),
      rpc,
      deviceId: DEVICE,
      now: () => 9_000_000,
    });
    open.push(board);
    board.start();
    await vi.waitFor(() => expect(board.rankFor(0).rank).toBe(4));
    board.around(10, 'world', 'week');
    board.top('country', 10, 10);
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'get_around' && call.args.period === 'week' && call.args.scope === 'world')).toBe(true));
    await vi.waitFor(() => {
      const top = calls.find((call) => call.fn === 'get_board' && call.args.scope === 'country');
      expect(top?.args.country).toBe('GB');
      expect(top?.args.period).toBe('all');
    });
    await vi.waitFor(() => expect(board.top('country', 10, 10).some((row) => row.country === 'GB')).toBe(true));
    await vi.waitFor(() => expect(board.top('world', 10, 10).length).toBeGreaterThan(0));
    expect(board.top('world', 10, 10).every((row) => row.country == null)).toBe(true);
    expect(board.around(10, 'country').me.country).toBe('GB');

    board.report('HighKick');
    expect(board.around(10, 'world').above.some((row) => row.nickname === 'HighKick')).toBe(false);
    board.block('MidKick');
    expect(board.around(10, 'world').above.some((row) => row.nickname === 'MidKick')).toBe(false);
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'report_player' && call.args.reported_nickname === 'HighKick')).toBe(true));
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'block_player' && call.args.blocked_nickname === 'MidKick')).toBe(true));
  });

  it('keeps a refused unblock queued and registers an unknown device', async () => {
    const storage = memory();
    const { calls, rpc } = scripted(liveHandlers({
      unblock_player: () => ({ data: { ok: false, reason: 'unknown_player' } }),
    }));
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: 'GB',
      storage,
      rpc,
      deviceId: DEVICE,
      now: () => 9_000_000,
    });
    open.push(board);
    board.start();
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'get_rank')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const registersBefore = calls.filter((call) => call.fn === 'register_or_update_player').length;
    board.unblock('MidKick');
    await vi.waitFor(() => expect(calls.some((call) => (
      call.fn === 'unblock_player'
      && call.args.device_id === DEVICE
      && call.args.blocked_nickname === 'MidKick'
    ))).toBe(true));
    await vi.waitFor(() => (
      expect(calls.filter((call) => call.fn === 'register_or_update_player').length).toBeGreaterThan(registersBefore)
    ));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(storage.getItem('kicky.board.pending-moderation.v1')).toContain('MidKick');
  });

  it('keeps a rate-limited unblock queued', async () => {
    const storage = memory();
    const { calls, rpc } = scripted(liveHandlers({
      unblock_player: () => ({ data: { ok: false, reason: 'rate_limited' } }),
    }));
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: 'GB',
      storage,
      rpc,
      deviceId: DEVICE,
      now: () => 9_000_000,
    });
    open.push(board);
    board.start();
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'get_rank')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const registersBefore = calls.filter((call) => call.fn === 'register_or_update_player').length;
    board.unblock('MidKick');
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'unblock_player' && call.args.blocked_nickname === 'MidKick')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(storage.getItem('kicky.board.pending-moderation.v1')).toContain('MidKick');
    expect(calls.filter((call) => call.fn === 'register_or_update_player').length).toBe(registersBefore);
  });

  it('drops an implausible score instead of retrying it', async () => {
    const storage = memory();
    const { calls, rpc } = scripted(liveHandlers({
      submit_score: () => ({ data: { accepted: false, reason: 'implausible' } }),
    }));
    const board = createSupabaseLeaderboard({
      nickname: NICK,
      country: null,
      storage,
      rpc,
      deviceId: DEVICE,
      now: () => 4_000_000,
    });
    open.push(board);
    board.start();
    board.startRun();
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'start_run')).toBe(true));
    board.submit(20, 4_000_000, { combo: 1, durationMs: 100 });
    await vi.waitFor(() => expect(calls.some((call) => call.fn === 'submit_score')).toBe(true));
    expect(calls.find((call) => call.fn === 'submit_score')?.args).toMatchObject({
      kick_count: 0,
      kick_times: '',
      kick_checksum: runChecksum({
        deviceId: DEVICE,
        token: '22222222-2222-4222-8222-222222222222',
        score: 20,
        kickCount: 0,
        durationMs: 100,
        kickTimes: '',
      }),
    });
    await vi.waitFor(() => expect(storage.getItem('kicky.board.outbox.v1')).toBeNull());
  });
});
