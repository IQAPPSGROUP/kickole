import { describe, expect, it } from 'vitest';
import { LAUNCH_COLLECTION_ITEM_IDS } from './catalogue';
import { grantLaunchCollection } from '../billing/entitlement';
import {
  allOutfitSpecs,
  cowboyBootSpecs,
  facePropClearsEyes,
  familySafeName,
  outfitSpecs,
  specFits,
} from './outfitFit';
import {
  COWBOY_BOOT_ID,
  COWBOY_PRODUCT_ID,
  GOLD_LEGEND_STREAK,
  OUTFITS,
  cosmeticGrantAllowed,
  cosmeticPriceString,
  keepStoreCosmetic,
  outfitCoversBody,
} from './outfits';
import {
  buyOrEquipBoot,
  equipOutfit,
  grantStoreCosmetic,
  normalizeLocker,
  outfitOwned,
  rememberDevCosmetic,
} from './shop';

describe('themed outfits', () => {
  it('keeps every look off the launch collection and fully clothed', () => {
    const ids = new Set<string>();
    for (const outfit of OUTFITS) {
      expect(ids.has(outfit.id)).toBe(false);
      ids.add(outfit.id);
      expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(outfit.id);
      expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(outfit.productId);
      expect(outfitCoversBody(outfit)).toBe(true);
      expect(familySafeName(outfit.name)).toBe(true);
      expect(outfit.note.toLowerCase()).not.toContain('batman');
    }
    expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(COWBOY_BOOT_ID);
    expect(OUTFITS.find((outfit) => outfit.id === 'gold-legend')?.productId).toBeNull();
    expect(OUTFITS.filter((outfit) => outfit.id !== 'gold-legend').every((outfit) => outfit.productId)).toBe(true);
  });

  it('shows a store priceString and never invents one', () => {
    expect(cosmeticPriceString('kickole_outfit_alien', [])).toBeNull();
    expect(cosmeticPriceString('kickole_outfit_alien', [{ productId: 'kickole_outfit_alien', priceString: '  ' }])).toBeNull();
    expect(cosmeticPriceString('kickole_outfit_alien', [{ productId: 'kickole_outfit_alien', priceString: '€1,99' }])).toBe('€1,99');
    expect(cosmeticPriceString(null, [{ productId: COWBOY_PRODUCT_ID, priceString: '£1.99' }])).toBeNull();
    expect(cosmeticPriceString(COWBOY_PRODUCT_ID, [{ productId: COWBOY_PRODUCT_ID, priceString: '£1.99' }])).toBe('£1.99');
  });

  it('refuses coins, dev_sim, and the launch collection for themed looks', () => {
    const rich = normalizeLocker({ coins: 100000 });
    const bought = buyOrEquipBoot(rich, COWBOY_BOOT_ID);
    expect(bought.ok).toBe(false);
    if (!bought.ok) expect(bought.reason).toBe('billing_unavailable');
    expect(rich.ownedBoots).not.toContain(COWBOY_BOOT_ID);

    expect(cosmeticGrantAllowed('dev_sim')).toBe(false);
    expect(cosmeticGrantAllowed('none')).toBe(false);
    expect(cosmeticGrantAllowed('apple')).toBe(true);
    const simulated = grantStoreCosmetic(rich, 'alien', 'dev_sim');
    expect(simulated.ownedOutfits).toEqual([]);
    const apple = grantStoreCosmetic(rich, 'alien', 'apple');
    expect(apple.ownedOutfits).toEqual(['alien']);
    expect(grantStoreCosmetic(apple, 'gold-legend', 'apple').ownedOutfits).toEqual(['alien']);

    const launched = grantLaunchCollection(rich, 'apple', 'apple:launch');
    expect(launched.ownedOutfits).toEqual([]);
    expect(launched.ownedBoots).not.toContain(COWBOY_BOOT_ID);
    expect(keepStoreCosmetic('dev_sim', true, false)).toBe(false);
    expect(keepStoreCosmetic('apple', false, true)).toBe(false);
    expect(keepStoreCosmetic('apple', true, true)).toBe(true);
    expect(keepStoreCosmetic('none', false, true)).toBe(false);
    expect(keepStoreCosmetic('none', false, false)).toBe(true);
  });

  it('unlocks Gold Legend from a 50 combo and equips only owned looks', () => {
    const start = normalizeLocker({ bestStreak: GOLD_LEGEND_STREAK - 1 });
    expect(outfitOwned(start, 'gold-legend')).toBe(false);
    expect(equipOutfit(start, 'gold-legend').ok).toBe(false);
    const ready = normalizeLocker({ bestStreak: GOLD_LEGEND_STREAK });
    expect(outfitOwned(ready, 'gold-legend')).toBe(true);
    const worn = equipOutfit(ready, 'gold-legend');
    expect(worn.ok).toBe(true);
    if (worn.ok) expect(worn.locker.equippedOutfit).toBe('gold-legend');
    const forged = normalizeLocker({ ownedOutfits: ['gold-legend', 'alien'], bestStreak: 0, cosmeticSource: 'dev_sim' });
    expect(forged.ownedOutfits).toEqual([]);
    expect(forged.equippedOutfit).toBeNull();
  });

  it('fits every accessory to both bodies without a revealing extra mesh', () => {
    for (const body of ['male', 'female'] as const) {
      for (const outfit of OUTFITS) {
        const specs = outfitSpecs(outfit.id, body);
        expect(specs.length).toBeGreaterThan(0);
        for (const spec of specs) {
          expect(specFits(spec, body), `${outfit.id} ${body} ${spec.name}`).toBe(true);
          expect(familySafeName(spec.name)).toBe(true);
          expect(facePropClearsEyes(spec, body), `${body} ${spec.name}`).toBe(true);
        }
      }
      expect(allOutfitSpecs(body).some((spec) => /shorts|crop|bust/.test(spec.name))).toBe(false);
    }
    const maleCape = outfitSpecs('street-hero', 'male').find((spec) => spec.slot === 'cape');
    const femaleCape = outfitSpecs('street-hero', 'female').find((spec) => spec.slot === 'cape');
    expect(femaleCape && maleCape && femaleCape.size[0] < maleCape.size[0]).toBe(true);
    const maleBoot = cowboyBootSpecs('male').find((spec) => spec.name === 'cowboy-shaft');
    const femaleBoot = cowboyBootSpecs('female').find((spec) => spec.name === 'cowboy-shaft');
    expect(femaleBoot && maleBoot && femaleBoot.size[0] > maleBoot.size[0]).toBe(true);
    const maleToe = cowboyBootSpecs('male').find((spec) => spec.name === 'cowboy-toe');
    const femaleToe = cowboyBootSpecs('female').find((spec) => spec.name === 'cowboy-toe');
    expect(femaleToe && maleToe && femaleToe.position[2] > maleToe.position[2]).toBe(true);
    for (const body of ['male', 'female'] as const) {
      const heel = cowboyBootSpecs(body).find((spec) => spec.name === 'cowboy-heel');
      const shaft = cowboyBootSpecs(body).find((spec) => spec.name === 'cowboy-shaft');
      expect(heel?.size[1]).toBeGreaterThanOrEqual(0.018);
      expect(heel?.size[1]).toBeLessThanOrEqual(0.028);
      expect(shaft && shaft.position[1] + shaft.size[1] / 2).toBeLessThanOrEqual(0.053 + 0.02);
    }
    expect(cowboyBootSpecs('female').find((spec) => spec.name === 'cowboy-heel')?.size[1])
      .toBe(cowboyBootSpecs('male').find((spec) => spec.name === 'cowboy-heel')?.size[1]);
    const seventies = outfitSpecs('seventies', 'female').map((spec) => spec.name);
    expect(seventies.some((name) => name.includes('sweatband'))).toBe(true);
    expect(seventies.some((name) => name.includes('moustache'))).toBe(true);
    expect(seventies.some((name) => name.includes('short'))).toBe(false);
  });

  it('lets a development save preview a look without a dev_sim grant', () => {
    const dressed = rememberDevCosmetic(normalizeLocker(null), 'alien');
    expect(dressed.ownedOutfits).toEqual(['alien']);
    expect(dressed.equippedOutfit).toBe('alien');
    expect(dressed.cosmeticSource).toBe('none');
    const saved = normalizeLocker({ ownedOutfits: ['spaceman'], equippedOutfit: 'spaceman', cosmeticSource: 'none' });
    expect(saved.equippedOutfit).toBe('spaceman');
  });
});
