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
  it('starts with the samba shuffle and nothing else', () => {
    const locker = normalizeDances(null);
    expect(locker.equippedDance).toBe(STARTER_DANCE_ID);
    expect(locker.ownedDances).toEqual(['samba']);
    expect(dancesOwnedAt(0)).toEqual(['samba']);
  });

  it('unlocks robot, griddy and spin on the 10/25/50 ladder', () => {
    expect(dancesOwnedAt(10)).toEqual(['samba', 'robot']);
    expect(dancesOwnedAt(25)).toEqual(['samba', 'robot', 'griddy']);
    expect(dancesOwnedAt(50)).toEqual(['samba', 'robot', 'griddy', 'spin']);
    expect(rankFromCheer('streak:10')).toBe(10);
    expect(rankFromCheer('juggle:25')).toBe(25);
    expect(rankFromCheer('perfect:100')).toBe(100);
    expect(rankFromCheer('tier:freestyle')).toBe(50);
    expect(rankFromCheer('best')).toBe(0);
    expect(rankFromCheers(['streak:10', 'perfect:25'])).toBe(25);
  });

  it('refuses a forged owned id when the rank has not been earned', () => {
    const forged = normalizeDances({ danceRank: 0, ownedDances: ['spin', 'nope', 'griddy'], equippedDance: 'spin' });
    expect(forged.ownedDances).toEqual(['samba']);
    expect(forged.equippedDance).toBe('samba');
  });

  it('equips only an owned dance and keeps the choice', () => {
    const owned = withDanceRank(normalizeDances(null), 25);
    expect(owned.ownedDances).toContain('griddy');
    const locked = equipDance(owned, 'spin');
    expect(locked.ok).toBe(false);
    expect(locked.locker.equippedDance).toBe('samba');
    const equipped = equipDance(owned, 'griddy');
    expect(equipped.ok).toBe(true);
    expect(equipped.locker.equippedDance).toBe('griddy');
    const again = normalizeDances(equipped.locker);
    expect(again.equippedDance).toBe('griddy');
    expect(again.danceRank).toBe(25);
  });

  it('plays the newly unlocked dance at that milestone and the equipped dance for a new best', () => {
    const owned = dancesOwnedAt(50);
    expect(celebrationDance('streak:10', 'samba', owned)).toBe('robot');
    expect(celebrationDance('juggle:25', 'samba', owned)).toBe('griddy');
    expect(celebrationDance('perfect:50', 'robot', owned)).toBe('spin');
    expect(celebrationDance('best', 'robot', owned)).toBe('robot');
    expect(celebrationDance('tier:legend', 'samba', dancesOwnedAt(100))).toBe('spin');
    expect(celebrationDance('streak:10', 'spin', ['samba'])).toBe('samba');
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
    expect(start.ownedDances).toEqual(['samba', 'robot']);
    const granted = grantLaunchCollection(start, 'apple', 'apple:opaque');
    expect(granted.ownedDances).toEqual(start.ownedDances);
    expect(granted.equippedDance).toBe('robot');
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
    expect(migrated.ownedDances).toContain('robot');
    expect(migrated.equippedDance).toBe('samba');

    const forged = normalizeLocker({
      launchCollectionOwned: true,
      entitlementSource: 'dev_sim',
      entitlementVerifiedAt: 5,
      danceRank: 0,
      ownedDances: ['spin', 'griddy'],
      coins: 20,
    });
    expect(forged.ownedDances).toEqual(['samba']);
    expect(forged.coins).toBe(20);
    expect(forged.launchGrantedItemIds.some((id) => id.startsWith('dance'))).toBe(false);
    const granted = grantLaunchCollection(forged, 'dev_sim', null);
    expect(granted.ownedDances).toEqual(['samba']);
    expect(granted.equippedDance).toBe('samba');
  });
});
