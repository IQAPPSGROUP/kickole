import { describe, expect, it } from 'vitest';
import { BOOTS, KITS, STARTER_BOOT_ID, STARTER_KIT_ID } from './catalogue';
import { EMPTY_BOOT_PROGRESS } from './bootStyles';
import { COWBOY_BOOT_ID } from './outfits';
import { WARDROBE_VERSION, normalizeLocker } from './shop';

describe('wardrobe locker', () => {
  it('starts with the free starter boot and kit', () => {
    const start = normalizeLocker(null);
    expect(start.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(start.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(start.bootProgress).toEqual(EMPTY_BOOT_PROGRESS);
    expect(start.ownedKits).toEqual([STARTER_KIT_ID]);
    expect(start.wardrobeVersion).toBe(WARDROBE_VERSION);
    expect('coins' in start).toBe(false);
    expect('ownedOutfits' in start).toBe(false);
    expect('launchCollectionOwned' in start).toBe(false);
  });

  it('drops old catalogue boots until the play goals are met', () => {
    const migrated = normalizeLocker({
      wardrobeVersion: 4,
      ownedBoots: ['street', 'samba', 'carnival', 'ole', COWBOY_BOOT_ID, 'boot-gold'],
      equippedBoot: 'boot-gold',
      challenges: { alternateFoot: 80, stalls: 40, perfectTouch: 100 },
    });
    expect(migrated.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(migrated.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(migrated.bootProgress).toEqual(EMPTY_BOOT_PROGRESS);
    expect('coins' in migrated).toBe(false);
  });

  it('keeps a style the saved goals have earned and ignores a forged list', () => {
    const earned = normalizeLocker({
      wardrobeVersion: 5,
      bootProgress: { kickUps: 2500, rainbows: 1, bestTricksInRun: 5, bestBeats: 3, combo5: true },
      equippedBoot: 'boot-gold',
      ownedBoots: ['boot-classic'],
    });
    expect(earned.ownedBoots).toEqual([
      'boot-classic',
      'boot-wellies',
      'boot-cowboy',
      'boot-hitops',
      'boot-snow',
      'boot-space',
      'boot-knight',
      'boot-gold',
    ]);
    expect(earned.equippedBoot).toBe('boot-gold');
    const forged = normalizeLocker({
      wardrobeVersion: 5,
      bootProgress: { kickUps: 100, rainbows: 0, bestTricksInRun: 0, bestBeats: 0, combo5: false },
      equippedBoot: 'boot-gold',
      ownedBoots: ['boot-gold', 'boot-space', 'boot-knight'],
    });
    expect(forged.ownedBoots).toEqual(['boot-classic', 'boot-wellies']);
    expect(forged.equippedBoot).toBe(STARTER_BOOT_ID);
  });

  it('ignores a saved receipt, coin balance, and dev grant', () => {
    const raw = {
      wardrobeVersion: 3,
      coins: 900,
      launchCollectionOwned: true,
      entitlementSource: 'dev_sim',
      entitlementTransactionRef: 'apple:test',
      launchGrantedItemIds: ['boot-legend-spike', 'boot-gold'],
      ownedOutfits: ['alien'],
      equippedOutfit: 'alien',
      ownedPacks: ['party'],
    };
    const saved = normalizeLocker(raw);
    expect(saved.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(saved.equippedBoot).toBe(STARTER_BOOT_ID);
    expect(saved.wardrobeVersion).toBe(WARDROBE_VERSION);
    expect('coins' in saved).toBe(false);
    expect('entitlementSource' in saved).toBe(false);
    expect('ownedOutfits' in saved).toBe(false);
    expect('ownedPacks' in saved).toBe(false);
  });

  it('applies a legacy skin once and then keeps a customised look', () => {
    const migrated = normalizeLocker({ legacySkinId: 'coral-flash' });
    expect(migrated.appearance.skinTone).toBe('#8D5A3C');
    expect(migrated.appearance.clothing.shirt).toBe('#FF805D');
    expect(migrated.wardrobeVersion).toBe(WARDROBE_VERSION);
    expect(migrated.appearance.body).toBe('male');
    expect(migrated.bodyChosen).toBe(false);
    const custom = {
      body: 'male' as const,
      skinTone: '#F2CDAA',
      hairColor: '#C9822B',
      kitColourId: 'custom',
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

  it('defaults an existing save to the male footballer and keeps a chosen female', () => {
    const migrated = normalizeLocker({
      wardrobeVersion: 2,
      appearance: {
        skinTone: '#C68642',
        hairColor: '#16100E',
        hairStyle: 'braids',
        clothing: { shirt: '#FFD93D', shirtTrim: '#1E2A5A', shorts: '#1E2A5A', socks: '#F8F9FB' },
      },
    });
    expect(migrated.appearance.body).toBe('male');
    expect(migrated.bodyChosen).toBe(true);
    expect(migrated.appearance.skinTone).toBe('#C68642');
    expect(migrated.appearance.hairColor).toBe('#16100E');
    expect(migrated.appearance.kitColourId).toBe('neutral');
    expect(migrated.appearance.clothing.shirt).toBe('#E4E0D8');
    expect('hairStyle' in migrated.appearance).toBe(false);
    const chosen = normalizeLocker({
      ...migrated,
      bodyChosen: true,
      appearance: { ...migrated.appearance, body: 'female' },
    });
    expect(chosen.appearance.body).toBe('female');
    expect(chosen.bodyChosen).toBe(true);
    expect(chosen.appearance.skinTone).toBe('#C68642');
  });

  it('keeps the starter catalogue and no coin prices', () => {
    expect(BOOTS.length).toBeGreaterThanOrEqual(8);
    expect(KITS.length).toBeGreaterThanOrEqual(6);
    expect(BOOTS.every((boot) => !('price' in boot.unlock))).toBe(true);
    expect(KITS.every((kit) => !('price' in kit.unlock))).toBe(true);
    expect(BOOTS.every((boot) => !('storeProductId' in boot))).toBe(true);
    expect(BOOTS.every((boot) => !('perfectExtra' in boot))).toBe(true);
  });
});
