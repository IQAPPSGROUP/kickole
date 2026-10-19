import { describe, expect, it } from 'vitest';
import { grantLaunchCollection } from '../billing/entitlement';
import { LAUNCH_COLLECTION_ITEM_IDS } from './catalogue';
import {
  DANCES,
  STARTER_DANCE_ID,
  celebrationDance,
  dancePriceString,
  dancesOwnedAt,
  equipDance,
  normalizeDances,
  rankFromCheer,
  rankFromCheers,
  withDanceRank,
} from './dances';
import { normalizeLocker } from './shop';

describe('dance unlocks', () => {
  it('starts with soft sway and nothing else', () => {
    const locker = normalizeDances(null);
    expect(locker.equippedDance).toBe(STARTER_DANCE_ID);
    expect(locker.ownedDances).toEqual(['sway']);
    expect(dancesOwnedAt(0)).toEqual(['sway']);
  });

  it('unlocks pendulum, shuffle and heel rock on the 10/25/50 ladder', () => {
    expect(dancesOwnedAt(10)).toEqual(['sway', 'pendulum']);
    expect(dancesOwnedAt(25)).toEqual(['sway', 'pendulum', 'shuffle']);
    expect(dancesOwnedAt(50)).toEqual(['sway', 'pendulum', 'shuffle', 'heelrock']);
    expect(rankFromCheer('streak:10')).toBe(10);
    expect(rankFromCheer('juggle:25')).toBe(25);
    expect(rankFromCheer('perfect:100')).toBe(100);
    expect(rankFromCheer('tier:freestyle')).toBe(50);
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
    expect(celebrationDance('tier:legend', 'sway', dancesOwnedAt(100))).toBe('heelrock');
    expect(celebrationDance('streak:10', 'heelrock', ['sway'])).toBe('sway');
  });
});

describe('dance shop boundaries', () => {
  it('has no paid product ids and never invents a price', () => {
    for (const dance of DANCES) expect(dance.productId).toBeNull();
    expect(dancePriceString(DANCES[1], [])).toBeNull();
    expect(dancePriceString(
      { ...DANCES[1], productId: 'future_dance' },
      [{ productId: 'future_dance', priceString: '€1,99' }],
    )).toBe('€1,99');
    expect(dancePriceString(
      { ...DANCES[1], productId: 'future_dance' },
      [{ productId: 'other', priceString: '£2.99' }],
    )).toBeNull();
  });

  it('keeps dances out of the Launch Collection', () => {
    for (const dance of DANCES) {
      expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(dance.id);
    }
    const start = normalizeLocker({ coins: 40, danceRank: 10, equippedDance: 'robot' });
    expect(start.ownedDances).toEqual(['sway', 'pendulum']);
    const granted = grantLaunchCollection(start, 'apple', 'apple:opaque');
    expect(granted.ownedDances).toEqual(start.ownedDances);
    expect(granted.equippedDance).toBe('pendulum');
    for (const id of LAUNCH_COLLECTION_ITEM_IDS) {
      expect(id.startsWith('dance')).toBe(false);
    }
  });

  it('migrates a v2 locker without wiping coins, and a simulated purchase cannot add dances', () => {
    const migrated = normalizeLocker({
      wardrobeVersion: 2,
      coins: 1800,
      challenges: { alternateFoot: 40, stalls: 0, perfectTouch: 3 },
      ownedBoots: ['boot-street-classic'],
      ownedKits: ['kit-street-classic'],
    });
    expect(migrated.wardrobeVersion).toBe(3);
    expect(migrated.coins).toBe(1800);
    expect(migrated.danceRank).toBe(10);
    expect(migrated.ownedDances).toContain('pendulum');
    expect(migrated.equippedDance).toBe('sway');

    const forged = normalizeLocker({
      launchCollectionOwned: true,
      entitlementSource: 'dev_sim',
      entitlementVerifiedAt: 5,
      danceRank: 0,
      ownedDances: ['spin', 'griddy'],
      coins: 20,
    });
    expect(forged.ownedDances).toEqual(['sway']);
    expect(forged.coins).toBe(20);
    expect(forged.launchGrantedItemIds.some((id) => id.startsWith('dance'))).toBe(false);
    const granted = grantLaunchCollection(forged, 'dev_sim', null);
    expect(granted.ownedDances).toEqual(['sway']);
    expect(granted.equippedDance).toBe('sway');
  });
});
