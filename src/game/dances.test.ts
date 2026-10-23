import { describe, expect, it } from 'vitest';
import {
  DANCES,
  STARTER_DANCE_ID,
  celebrationDance,
  dancesOwnedAt,
  equipDance,
  normalizeDances,
  rankFromCheer,
  rankFromCheers,
  withDanceRank,
} from './dances';
import { WARDROBE_VERSION, normalizeLocker } from './shop';

describe('dance unlocks', () => {
  it('starts with soft sway and nothing else', () => {
    const locker = normalizeDances(null);
    expect(locker.equippedDance).toBe(STARTER_DANCE_ID);
    expect(locker.ownedDances).toEqual(['sway']);
    expect(dancesOwnedAt(0)).toEqual(['sway']);
  });

  it('shows generic dance names', () => {
    expect(DANCES.map((dance) => dance.name)).toEqual([
      'Soft Sway',
      'Pendulum',
      'Shuffle Step',
      'Heel Rock',
    ]);
  });

  it('unlocks pendulum, shuffle and heel rock on the 10/25/50 ladder', () => {
    expect(dancesOwnedAt(10)).toEqual(['sway', 'pendulum']);
    expect(dancesOwnedAt(25)).toEqual(['sway', 'pendulum', 'shuffle']);
    expect(dancesOwnedAt(50)).toEqual(['sway', 'pendulum', 'shuffle', 'heelrock']);
    expect(rankFromCheer('streak:10')).toBe(10);
    expect(rankFromCheer('juggle:25')).toBe(25);
    expect(rankFromCheer('perfect:100')).toBe(100);
    expect(rankFromCheer('best')).toBe(0);
    expect(rankFromCheers(['streak:10', 'perfect:25'])).toBe(25);
  });

  it('refuses a forged owned id when the rank has not been earned', () => {
    const forged = normalizeDances({ danceRank: 0, ownedDances: ['spin', 'nope', 'griddy'], equippedDance: 'spin' });
    expect(forged.ownedDances).toEqual(['sway']);
    expect(forged.equippedDance).toBe('sway');
    const kept = normalizeDances({ danceRank: 50, ownedDances: ['spin', 'griddy'], equippedDance: 'griddy' });
    expect(kept.equippedDance).toBe('shuffle');
    expect(kept.ownedDances).toEqual(['sway', 'pendulum', 'shuffle', 'heelrock']);
  });

  it('equips only an owned dance and keeps the choice', () => {
    const owned = withDanceRank(normalizeDances(null), 25);
    expect(owned.ownedDances).toContain('shuffle');
    const locked = equipDance(owned, 'heelrock');
    expect(locked.ok).toBe(false);
    expect(locked.locker.equippedDance).toBe('sway');
    const equipped = equipDance(owned, 'shuffle');
    expect(equipped.ok).toBe(true);
    expect(equipped.locker.equippedDance).toBe('shuffle');
    const again = normalizeDances(equipped.locker);
    expect(again.equippedDance).toBe('shuffle');
    expect(again.danceRank).toBe(25);
  });

  it('plays the newly unlocked dance at that milestone and the equipped dance for a new best', () => {
    const owned = dancesOwnedAt(50);
    expect(celebrationDance('streak:10', 'sway', owned)).toBe('pendulum');
    expect(celebrationDance('juggle:25', 'sway', owned)).toBe('shuffle');
    expect(celebrationDance('perfect:50', 'pendulum', owned)).toBe('heelrock');
    expect(celebrationDance('best', 'pendulum', owned)).toBe('pendulum');
    expect(celebrationDance('streak:10', 'heelrock', ['sway'])).toBe('sway');
  });
});

describe('dance milestones', () => {
  it('has no store product field', () => {
    for (const dance of DANCES) expect('productId' in dance).toBe(false);
  });

  it('keeps a milestone dance after a rename', () => {
    const start = normalizeLocker({ danceRank: 10, equippedDance: 'robot' });
    expect(start.ownedDances).toEqual(['sway', 'pendulum']);
    expect(start.equippedDance).toBe('pendulum');
  });

  it('migrates a v2 locker onto the free dance ladder and ignores a simulated grant', () => {
    const migrated = normalizeLocker({
      wardrobeVersion: 2,
      challenges: { alternateFoot: 40, stalls: 0, perfectTouch: 3 },
      ownedBoots: ['boot-street-classic'],
      ownedKits: ['kit-street-classic'],
      ...{ coins: 1800 },
    });
    expect(migrated.wardrobeVersion).toBe(WARDROBE_VERSION);
    expect('coins' in migrated).toBe(false);
    expect(migrated.danceRank).toBe(10);
    expect(migrated.ownedDances).toContain('pendulum');
    expect(migrated.equippedDance).toBe('sway');

    const forgedRaw = {
      launchCollectionOwned: true,
      entitlementSource: 'dev_sim',
      danceRank: 0,
      ownedDances: ['spin', 'griddy'],
      coins: 20,
    };
    const forged = normalizeLocker(forgedRaw);
    expect(forged.ownedDances).toEqual(['sway']);
    expect(forged.equippedDance).toBe('sway');
    expect('coins' in forged).toBe(false);
    expect('launchCollectionOwned' in forged).toBe(false);
  });
});
