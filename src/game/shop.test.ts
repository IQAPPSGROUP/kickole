import { describe, expect, it } from 'vitest';
import { grantLaunchCollection, revokeLaunchCollection } from '../billing/entitlement';
import { BOOTS, KITS, LAUNCH_COLLECTION_ITEM_IDS, STARTER_BOOT_ID, STARTER_KIT_ID, UNLOCK_TIERS } from './catalogue';
import {
  buyOrEquipBoot,
  buyOrEquipKit,
  coinsForScore,
  meetsChallenge,
  normalizeLocker,
} from './shop';

describe('shop economy', () => {
  it('awards one coin per point and nothing for an empty run', () => {
    expect(coinsForScore(0)).toBe(0);
    expect(coinsForScore(-4)).toBe(0);
    expect(coinsForScore(12.9)).toBe(12);
  });

  it('refuses a purchase the balance cannot cover and equips owned items free', () => {
    const start = normalizeLocker(null);
    expect(start.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(start.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(start.ownedKits).toEqual([STARTER_KIT_ID]);

    const club = BOOTS.find((b) => b.unlock.tier === 'club')!;
    const broke = buyOrEquipBoot(start, club.id);
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe('broke');

    const paid = buyOrEquipBoot({ ...start, coins: club.unlock.price }, club.id);
    expect(paid.ok).toBe(true);
    if (paid.ok) {
      expect(paid.locker.coins).toBe(0);
      expect(paid.locker.ownedBoots).toContain(club.id);
      expect(paid.locker.equippedBoot).toBe(club.id);
      const back = buyOrEquipBoot(paid.locker, STARTER_BOOT_ID);
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.locker.equippedBoot).toBe(STARTER_BOOT_ID);
        expect(back.locker.coins).toBe(0);
      }
    }
  });

  it('locks street-tier items until the alternating-foot challenge is met', () => {
    const street = BOOTS.find((b) => b.unlock.tier === 'street')!;
    const rich = normalizeLocker({ coins: street.unlock.price + 10 });
    expect(meetsChallenge(rich.challenges, street.unlock)).toBe(false);
    const locked = buyOrEquipBoot(rich, street.id);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.reason).toBe('locked');

    const ready = {
      ...rich,
      challenges: { ...rich.challenges, alternateFoot: UNLOCK_TIERS.street.challengeTarget },
    };
    const bought = buyOrEquipBoot(ready, street.id);
    expect(bought.ok).toBe(true);
  });

  it('buys kits independently from boots without changing appearance', () => {
    const kit = KITS.find((k) => k.unlock.tier === 'club')!;
    const start = normalizeLocker({
      coins: kit.unlock.price,
      appearance: { skinTone: '#5C3A2A', hairColor: '#C9822B', hairStyle: 'afro', clothing: startClothing() },
    });
    const skinBefore = start.appearance.skinTone;
    const hairBefore = start.appearance.hairStyle;
    const result = buyOrEquipKit(start, kit.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.locker.equippedKit).toBe(kit.id);
      expect(result.locker.appearance.skinTone).toBe(skinBefore);
      expect(result.locker.appearance.hairStyle).toBe(hairBefore);
      expect(result.locker.equippedBoot).toBe(STARTER_BOOT_ID);
    }
  });

  it('does not double-award coins or duplicate owned ids on re-equip', () => {
    const start = normalizeLocker({ coins: 5000, ownedBoots: [STARTER_BOOT_ID, 'boot-carnival'] });
    const again = buyOrEquipBoot(start, 'boot-carnival');
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.locker.coins).toBe(5000);
      expect(again.locker.ownedBoots.filter((id) => id === 'boot-carnival')).toHaveLength(1);
    }
  });

  it('maps legacy boot ids during migration and keeps coins', () => {
    const migrated = normalizeLocker({
      coins: 900,
      ownedBoots: ['street', 'samba', 'carnival', 'ole'],
      equippedBoot: 'ole',
    });
    expect(migrated.coins).toBe(900);
    expect(migrated.ownedBoots).toContain(STARTER_BOOT_ID);
    expect(migrated.ownedBoots).toContain('boot-beach-wave');
    expect(migrated.ownedBoots).toContain('boot-carnival');
    expect(migrated.ownedBoots).toContain('boot-gold');
    expect(migrated.equippedBoot).toBe('boot-gold');
  });

  it('Launch Collection ownership bypasses coin/challenge gates for launch items', () => {
    const legend = BOOTS.find((b) => b.id === 'boot-legend-spike')!;
    const granted = grantLaunchCollection(normalizeLocker(null), 'apple', 'apple:test');
    expect(granted.coins).toBe(0);
    expect(meetsChallenge(granted.challenges, legend.unlock)).toBe(false);
    const equip = buyOrEquipBoot(granted, legend.id);
    expect(equip.ok).toBe(true);
    if (equip.ok) {
      expect(equip.locker.equippedBoot).toBe(legend.id);
      expect(equip.locker.coins).toBe(0);
    }
  });

  it('Launch Collection grant/revoke keeps coin-bought items', () => {
    const start = normalizeLocker({ coins: 2500 });
    const club = BOOTS.find((b) => b.id === 'boot-beach-wave')!;
    const paid = buyOrEquipBoot(start, club.id);
    expect(paid.ok).toBe(true);
    const unlocked = grantLaunchCollection(paid.ok ? paid.locker : start, 'apple', 'apple:test');
    expect(unlocked.launchCollectionOwned).toBe(true);
    expect(unlocked.entitlementSource).toBe('apple');
    for (const id of LAUNCH_COLLECTION_ITEM_IDS) {
      if (id.startsWith('boot-')) expect(unlocked.ownedBoots).toContain(id);
      if (id.startsWith('kit-')) expect(unlocked.ownedKits).toContain(id);
    }
    // Coin-bought beach wave is no longer in launchGranted after markCoinOwned.
    expect(unlocked.launchGrantedItemIds).not.toContain('boot-beach-wave');
    const revoked = revokeLaunchCollection(unlocked);
    expect(revoked.launchCollectionOwned).toBe(false);
    expect(revoked.ownedBoots).toContain('boot-beach-wave');
    expect(revoked.ownedBoots).not.toContain('boot-legend-spike');
  });

  it('ignores a hand-edited launchCollectionOwned boolean without store source', () => {
    const forged = normalizeLocker({ launchCollectionOwned: true, coins: 0 });
    expect(forged.launchCollectionOwned).toBe(false);
    expect(forged.ownedBoots).toEqual([STARTER_BOOT_ID]);
  });

  it('does not unlock a hand-edited apple or google entitlement unless the native cache is trusted', () => {
    const forged = normalizeLocker({
      launchCollectionOwned: true,
      entitlementSource: 'apple',
      entitlementVerifiedAt: 50,
    });
    expect(forged.launchCollectionOwned).toBe(false);
    expect(forged.ownedBoots).toEqual([STARTER_BOOT_ID]);

    const cached = normalizeLocker({
      launchCollectionOwned: true,
      entitlementSource: 'google',
      entitlementVerifiedAt: 40,
      launchGrantedItemIds: ['boot-gold'],
    }, { trustStoreCache: true });
    expect(cached.launchCollectionOwned).toBe(true);
    expect(cached.entitlementSource).toBe('google');
    expect(cached.ownedBoots).toContain('boot-gold');
  });

  it('applies a legacy skin once and then keeps a customised look', () => {
    const migrated = normalizeLocker({ legacySkinId: 'coral-flash' });
    expect(migrated.appearance.skinTone).toBe('#8D5A3C');
    expect(migrated.appearance.clothing.shirt).toBe('#FF805D');
    expect(migrated.wardrobeVersion).toBe(3);
    const custom = {
      skinTone: '#F2CDAA',
      hairColor: '#C9822B',
      hairStyle: 'short' as const,
      clothing: { shirt: '#9B59B6', shirtTrim: '#111111', shorts: '#222222', socks: '#333333' },
    };
    const again = normalizeLocker({
      ...migrated,
      legacySkinId: 'coral-flash',
      wardrobeVersion: 2,
      appearance: custom,
    });
    expect(again.appearance).toEqual(custom);
    const third = normalizeLocker({ ...again, legacySkinId: 'lime-night' });
    expect(third.appearance).toEqual(custom);
    expect(third.ownedKits).toEqual(again.ownedKits);
  });

  it('catalogue has ~8 boots and ~6 kits including starters', () => {
    expect(BOOTS.length).toBeGreaterThanOrEqual(8);
    expect(KITS.length).toBeGreaterThanOrEqual(6);
    expect(BOOTS.some((b) => b.unlock.price === 0)).toBe(true);
    expect(KITS.some((k) => k.unlock.price === 0)).toBe(true);
    expect(BOOTS.every((b) => !('perfectExtra' in b))).toBe(true);
  });
});

function startClothing() {
  return { shirt: '#12BFA6', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#12BFA6' };
}
