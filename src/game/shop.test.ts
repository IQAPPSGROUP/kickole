import { describe, expect, it } from 'vitest';
import { BOOTS, KITS, LAUNCH_COLLECTION_ITEM_IDS, STARTER_BOOT_ID, STARTER_KIT_ID, UNLOCK_TIERS } from './catalogue';
import {
  applyLaunchCollection,
  buyOrEquipBoot,
  buyOrEquipKit,
  coinsForScore,
  meetsChallenge,
  normalizeLocker,
  purchaseLaunchCollection,
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

  it('Launch Collection grants only launch IDs and billing stays unavailable', () => {
    const start = normalizeLocker(null);
    expect(purchaseLaunchCollection(start).reason).toBe('billing_unavailable');
    const unlocked = applyLaunchCollection(start);
    expect(unlocked.launchCollectionOwned).toBe(true);
    for (const id of LAUNCH_COLLECTION_ITEM_IDS) {
      if (id.startsWith('boot-')) expect(unlocked.ownedBoots).toContain(id);
      if (id.startsWith('kit-')) expect(unlocked.ownedKits).toContain(id);
    }
    expect(unlocked.coins).toBe(0);
    // Idempotent.
    expect(applyLaunchCollection(unlocked).ownedBoots).toEqual(unlocked.ownedBoots);
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
