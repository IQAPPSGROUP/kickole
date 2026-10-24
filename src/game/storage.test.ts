import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_BOOT_ID, STARTER_KIT_ID } from './catalogue';

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

  it('returns a migrated empty wardrobe when nothing is stored', async () => {
    const { loadSave } = await load();
    const save = loadSave();
    expect(save.best).toBe(0);
    expect(save.leaderboard).toEqual([]);
    expect('coins' in save).toBe(false);
    expect(save.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(save.ownedKits).toEqual([STARTER_KIT_ID]);
    expect(save.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(save.equippedKit).toBe(STARTER_KIT_ID);
    expect('launchCollectionOwned' in save).toBe(false);
    expect(save.bodyChosen).toBe(false);
    expect(save.appearance.body).toBe('male');
  });

  it('survives corrupt JSON', async () => {
    const { loadSave, loadSettings, DEFAULT_SETTINGS } = await load({ 'kicky.save.v1': '{nope', 'kicky.settings.v1': '[[' });
    expect(loadSave().best).toBe(0);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('drops invalid leaderboard entries, including ones without a date', async () => {
    const raw = JSON.stringify({ best: 5, leaderboard: [{ score: 5, kickUps: 2, date: 1 }, { score: 9, kickUps: 3 }, null, { score: 'x' }] });
    const { loadSave } = await load({ 'kicky.save.v1': raw });
    expect(loadSave().leaderboard).toHaveLength(1);
  });

  it('records runs, keeps the best five and persists them', async () => {
    const { loadSave, saveRun, ls } = await load();
    let save = loadSave();
    for (let i = 1; i <= 7; i++) {
      save = saveRun(save, { score: i * 10, kickUps: i, date: i }).save;
    }
    expect(save.leaderboard.map((r) => r.score)).toEqual([70, 60, 50, 40, 30]);
    expect(save.best).toBe(70);
    expect('coins' in save).toBe(false);
    const stored = JSON.parse(ls.data['kicky.save.v1']);
    expect(stored.best).toBe(70);
    expect(stored.coins).toBeUndefined();
  });

  it('accumulates challenge progress across runs', async () => {
    const { loadSave, saveRun } = await load();
    const first = saveRun(loadSave(), { score: 20, kickUps: 4, date: 1 }, { alternateFoot: 3, stalls: 1, perfectTouch: 2 });
    expect('coinsEarned' in first).toBe(false);
    expect(first.save.challenges).toEqual({ alternateFoot: 3, stalls: 1, perfectTouch: 2 });
    const second = saveRun(first.save, { score: 10, kickUps: 2, date: 2 }, { alternateFoot: 2, stalls: 0, perfectTouch: 4 });
    expect(second.save.challenges).toEqual({ alternateFoot: 5, stalls: 1, perfectTouch: 6 });
    expect('coins' in second.save).toBe(false);
  });

  it('migrates legacy boot locker and free skin into kits', async () => {
    const raw = JSON.stringify({
      best: 40,
      leaderboard: [{ score: 40, kickUps: 8, date: 1 }],
      coins: 1200,
      ownedBoots: ['street', 'samba'],
      equippedBoot: 'samba',
    });
    const { loadSave } = await load({
      'kicky.save.v1': raw,
      'kicky.settings.v1': JSON.stringify({ skinId: 'coral-flash', sound: true, vibration: true, quality: 'high' }),
    });
    const save = loadSave();
    expect('coins' in save).toBe(false);
    expect(save.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(save.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(save.ownedKits).toContain('kit-carnival');
    expect(save.appearance.skinTone).toBe('#8D5A3C');
    expect(save.appearance.body).toBe('male');
    expect(save.bodyChosen).toBe(true);
  });

  it('does not reset a saved look on later launches when settings still hold a legacy skin', async () => {
    const appearance = {
      skinTone: '#F2CDAA',
      hairColor: '#C9822B',
      clothing: { shirt: '#9B59B6', shirtTrim: '#111111', shorts: '#222222', socks: '#333333' },
    };
    const kept = { ...appearance, body: 'male' as const, kitColourId: 'custom' };
    const stored = { ...appearance, hairStyle: 'short' };
    const raw = JSON.stringify({
      wardrobeVersion: 2,
      appearance: stored,
      coins: 10,
      best: 3,
      leaderboard: [],
      ownedBoots: ['boot-street-classic'],
      ownedKits: ['kit-street-classic'],
    });
    const { loadSave } = await load({
      'kicky.save.v1': raw,
      'kicky.settings.v1': JSON.stringify({ skinId: 'coral-flash', sound: true, vibration: true, quality: 'high' }),
    });
    const first = loadSave();
    expect(first.appearance).toEqual(kept);
    expect('hairStyle' in first.appearance).toBe(false);
    expect(first.bodyChosen).toBe(true);
    expect(first.ownedKits).not.toContain('kit-carnival');
    const second = loadSave();
    expect(second.appearance).toEqual(kept);
    expect(second.appearance.clothing.shirt).toBe('#9B59B6');
  });

  it('persists a free female choice and leaves an unchosen install unwritten', async () => {
    const { loadSave, choosePlayerBody, ls } = await load();
    expect(ls.data['kicky.save.v1']).toBeUndefined();
    const chosen = choosePlayerBody(loadSave(), 'female');
    expect(chosen.appearance.body).toBe('female');
    expect(chosen.bodyChosen).toBe(true);
    expect(JSON.parse(ls.data['kicky.save.v1']).appearance.body).toBe('female');
    const again = loadSave();
    expect(again.appearance.body).toBe('female');
    expect(again.bodyChosen).toBe(true);
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

  it('persists music and effects volume and clamps a bad value', async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await load({
      'kicky.settings.v1': JSON.stringify({ musicVolume: 1.5, sfxVolume: -2, sound: false }),
    });
    const loaded = loadSettings();
    expect(loaded.musicVolume).toBe(1);
    expect(loaded.sfxVolume).toBe(0);
    expect(loaded.sound).toBe(false);
    saveSettings({ ...loaded, musicVolume: 0.4, sfxVolume: 0.25 });
    expect(loadSettings().musicVolume).toBe(0.4);
    expect(loadSettings().sfxVolume).toBe(0.25);
    const legacy = await load({ 'kicky.settings.v1': JSON.stringify({ sound: true }) });
    expect(legacy.loadSettings().musicVolume).toBe(DEFAULT_SETTINGS.musicVolume);
    expect(legacy.loadSettings().sfxVolume).toBe(1);
    expect(legacy.loadSettings().song).toBe('shuffle');
    saveSettings({ ...loaded, song: 'game-song-2' });
    expect(loadSettings().song).toBe('game-song-2');
    const junk = await load({ 'kicky.settings.v1': JSON.stringify({ song: 'not-a-track' }) });
    expect(junk.loadSettings().song).toBe('shuffle');
    expect(junk.loadSettings().enabledSongs).toEqual(['gameplay-instrumental', 'menu-song', 'game-song-2', 'game-song-3']);
    const { loadSettings: loadKept, saveSettings: saveKept } = await load({
      'kicky.settings.v1': JSON.stringify({ enabledSongs: ['menu-song', 'game-song-3'] }),
    });
    expect(loadKept().enabledSongs).toEqual(['menu-song', 'game-song-3']);
    saveKept({ ...loadKept(), enabledSongs: ['game-song-2'] });
    expect(loadKept().enabledSongs).toEqual(['game-song-2']);
    const dropped = await load({
      'kicky.settings.v1': JSON.stringify({ song: 'game-song-2', enabledSongs: ['menu-song'] }),
    });
    expect(dropped.loadSettings().song).toBe('shuffle');
    expect(dropped.loadSettings().enabledSongs).toEqual(['menu-song']);
    const empty = await load({ 'kicky.settings.v1': JSON.stringify({ enabledSongs: [] }) });
    expect(empty.loadSettings().enabledSongs).toEqual(['gameplay-instrumental', 'menu-song', 'game-song-2', 'game-song-3']);
  });

  it('validates settings and round-trips them', async () => {
    const { loadSettings, saveSettings, DEFAULT_SETTINGS } = await load({ 'kicky.settings.v1': JSON.stringify({ sound: 'yes', quality: 'ultra', vibration: false, skinId: 'coral-flash' }) });
    const s = loadSettings();
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.vibration).toBe(false);
    expect(s.skinId).toBe('coral-flash');
    saveSettings({ ...s, quality: 'low' });
    expect(loadSettings().quality).toBe('low');
    expect(s.hints).toBe(true);
    saveSettings({ ...s, hints: false });
    expect(loadSettings().hints).toBe(false);
  });

  it('keeps an explicit graphics choice and treats a legacy high setting as auto', async () => {
    const { loadSettings, saveSettings, graphicsFromSaved, applyGraphicsPatch, DEFAULT_SETTINGS } = await load({
      'kicky.settings.v1': JSON.stringify({ quality: 'high', sound: true, vibration: true }),
    });
    expect(loadSettings().graphics).toBe('auto');
    expect(graphicsFromSaved({ quality: 'medium' })).toBe('medium');
    expect(graphicsFromSaved({ graphics: 'high', quality: 'low' })).toBe('high');
    const saved = applyGraphicsPatch(loadSettings(), { graphics: 'low' });
    saveSettings(saved);
    expect(loadSettings().graphics).toBe('low');
    expect(loadSettings().quality).toBe('low');
    const back = applyGraphicsPatch(loadSettings(), { graphics: 'auto' });
    expect(back.graphics).toBe('auto');
    expect(back.quality).toBe('low');
    expect(DEFAULT_SETTINGS.graphics).toBe('auto');
  });

  it('persists learned tricks and drops unknown ids', async () => {
    const raw = JSON.stringify({
      best: 0,
      leaderboard: [],
      wardrobeVersion: 3,
      learnedTricks: ['groove', 'forged', 'groove', 'rainbow'],
    });
    const { loadSave, persistSave, ls } = await load({ 'kicky.save.v1': raw });
    const save = loadSave();
    expect(save.learnedTricks).toEqual(['groove', 'rainbow']);
    const next = { ...save, learnedTricks: [...save.learnedTricks, 'header'] as typeof save.learnedTricks };
    persistSave(next);
    expect(JSON.parse(ls.data['kicky.save.v1']).learnedTricks).toEqual(['groove', 'rainbow', 'header']);
  });
});
