import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
}

async function load(initial?: Record<string, string>) {
  vi.resetModules();
  const ls = fakeStorage(initial);
  vi.stubGlobal('localStorage', ls);
  const mod = await import('./storage');
  return { ls, ...mod };
}

describe('storage', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('returns an empty save when nothing is stored', async () => {
    const { loadSave } = await load();
    expect(loadSave()).toEqual({ best: 0, leaderboard: [], coins: 0, ownedBoots: ['street'], equippedBoot: 'street' });
  });

  it('survives corrupt JSON', async () => {
    const { loadSave, loadSettings, DEFAULT_SETTINGS } = await load({ 'kicky.save.v1': '{nope', 'kicky.settings.v1': '[[' });
    expect(loadSave()).toEqual({ best: 0, leaderboard: [], coins: 0, ownedBoots: ['street'], equippedBoot: 'street' });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('drops invalid leaderboard entries, including ones without a date', async () => {
    const raw = JSON.stringify({ best: 5, leaderboard: [{ score: 5, kickUps: 2, date: 1 }, { score: 9, kickUps: 3 }, null, { score: 'x' }] });
    const { loadSave } = await load({ 'kicky.save.v1': raw });
    expect(loadSave().leaderboard).toHaveLength(1);
  });

  it('records runs, keeps the best five sorted and persists them', async () => {
    const { loadSave, saveRun, ls } = await load();
    let save = loadSave();
    for (let i = 1; i <= 7; i++) {
      save = saveRun(save, { score: i * 10, kickUps: i, date: i }).save;
    }
    expect(save.leaderboard.map((r) => r.score)).toEqual([70, 60, 50, 40, 30]);
    expect(save.best).toBe(70);
    expect(save.coins).toBe(280);
    expect(JSON.parse(ls.data['kicky.save.v1']).best).toBe(70);
  });

  it('flags a new personal best and reports the rank', async () => {
    const { loadSave, saveRun } = await load();
    const first = saveRun(loadSave(), { score: 20, kickUps: 4, date: 1 });
    expect(first.newBest).toBe(true);
    expect(first.rank).toBe(0);
    const second = saveRun(first.save, { score: 10, kickUps: 2, date: 2 });
    expect(second.newBest).toBe(false);
    expect(second.rank).toBe(1);
  });

  it('does not throw when storage is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    const { loadSave, saveRun, loadSettings, saveSettings, DEFAULT_SETTINGS } = await import('./storage');
    expect(loadSave().best).toBe(0);
    expect(() => saveRun(loadSave(), { score: 3, kickUps: 1, date: 1 })).not.toThrow();
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('validates settings and round-trips them', async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await load({ 'kicky.settings.v1': JSON.stringify({ sound: 'yes', quality: 'ultra', vibration: false, skinId: 'coral-flash' }) });
    const s = loadSettings();
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.vibration).toBe(false);
    expect(s.skinId).toBe('coral-flash');
    expect(s.sceneId).toBe('beach');
    expect(s.nickname).toBe('Kicky');
    saveSettings({ ...s, quality: 'low', sceneId: 'rua' });
    expect(loadSettings().quality).toBe('low');
    expect(loadSettings().sceneId).toBe('rua');
    saveSettings({ ...loadSettings(), sceneId: 'plaza' as 'rua' });
    expect(loadSettings().sceneId).toBe('beach');
    saveSettings({ ...loadSettings(), nickname: '  Ana\nB  ' });
    expect(loadSettings().nickname).toBe('AnaB');
  });
});
