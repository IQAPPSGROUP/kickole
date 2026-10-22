import { readFileSync } from 'node:fs';
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
  getOutfit,
  COWBOY_BOOT_ID,
  CONTENT_PACK_IDS,
  EARNED_OUTFIT_IDS,
  GOLD_LEGEND_STREAK,
  OUTFIT_IDS,
  OUTFITS,
  SHOP_PACKS,
  cosmeticGrantAllowed,
  cosmeticPriceString,
  earnedOutfit,
  everythingIncludesLine,
  everythingOwnedLine,
  everythingSavingLabel,
  keepStoreCosmetic,
  outfitCoversBody,
  packsGrantedBy,
} from './outfits';
import {
  applyOwnedPackProducts,
  buyOrEquipBoot,
  equipOutfit,
  grantShopPack,
  grantStoreCosmetic,
  keepTesterWear,
  normalizeLocker,
  outfitOwned,
  outfitSelectable,
  rememberDevCosmetic,
} from './shop';

describe('themed outfits', () => {
  it('keeps every look off the launch collection and fully clothed', () => {
    const ids = new Set<string>();
    for (const outfit of OUTFITS) {
      expect(ids.has(outfit.id)).toBe(false);
      ids.add(outfit.id);
      expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(outfit.id);
      expect(outfitCoversBody(outfit)).toBe(true);
      expect(familySafeName(outfit.name)).toBe(true);
      expect(outfit.note.toLowerCase()).not.toContain('batman');
      expect(outfit.milestone === null || earnedOutfit(outfit.id)).toBe(true);
    }
    expect(LAUNCH_COLLECTION_ITEM_IDS).not.toContain(COWBOY_BOOT_ID);
    expect(OUTFITS.find((outfit) => outfit.id === 'gold-legend')?.milestone?.kind).toBe('bestStreak');
    expect((OUTFIT_IDS as readonly string[]).includes('stripe-bandit')).toBe(false);
    expect((OUTFIT_IDS as readonly string[]).includes('secret-agent')).toBe(true);
    expect(OUTFITS.some((outfit) => /robber|bandit/i.test(outfit.name))).toBe(false);
  });

  it('shows a store priceString and never invents one', () => {
    expect(cosmeticPriceString('kickole_pack_heroes_space', [])).toBeNull();
    expect(cosmeticPriceString('kickole_pack_heroes_space', [{ productId: 'kickole_pack_heroes_space', priceString: '  ' }])).toBeNull();
    expect(cosmeticPriceString('kickole_pack_party', [{ productId: 'kickole_pack_party', priceString: '€1,99' }])).toBe('€1,99');
    expect(cosmeticPriceString(null, [{ productId: 'kickole_pack_party', priceString: '£1.99' }])).toBeNull();
    expect(cosmeticPriceString('kickole_pack_party', [{ productId: 'kickole_pack_party', priceString: '£1.99' }])).toBe('£1.99');
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
    for (const id of ['street-hero', 'night-glider'] as const) {
      for (const body of ['male', 'female'] as const) {
        const specs = outfitSpecs(id, body);
        const names = specs.map((spec) => spec.name).join(' ');
        expect(specs.some((spec) => spec.slot === 'cape' || spec.slot === 'chest'), names).toBe(false);
        expect(names).not.toMatch(/cowl|badge|emblem|bat|cape/i);
      }
    }
    const agent = outfitSpecs('secret-agent', 'male').map((spec) => spec.name);
    expect(agent).toContain('agent-glasses');
    expect(agent).toContain('agent-tie');
    expect(agent.join(' ')).not.toMatch(/mask|sack|beanie|domino/i);
    for (const body of ['male', 'female'] as const) {
      const zombie = outfitSpecs('grey-ghoul', body).map((spec) => `${spec.name} ${spec.slot}`).join(' ');
      expect(zombie).not.toMatch(/blood|gore|wound/i);
    }
    expect(outfitSpecs('ring-mask', 'male').some((spec) => spec.slot === 'cape')).toBe(true);
    const copied = /badge|crest|shield|fifa|uefa|premier|lion|eagle|cross|santo|mysterio|demon/i;
    for (const id of ['match-official', 'seventies', 'ring-mask'] as const) {
      for (const body of ['male', 'female'] as const) {
        const specs = outfitSpecs(id, body);
        const names = specs.map((spec) => `${spec.name} ${spec.slot}`).join(' ');
        expect(names, `${id} ${body}`).not.toMatch(copied);
      }
      expect(getOutfit(id)?.note ?? '').not.toMatch(/fifa|uefa|premier league|\bfa\b|barcelona|liverpool/i);
    }
    const referee = outfitSpecs('match-official', 'male').map((spec) => spec.name);
    expect(referee).toContain('whistle');
    expect(referee).toContain('card-yellow');
    expect(referee).toContain('card-red');
    expect(outfitSpecs('seventies', 'male').some((spec) => spec.slot === 'chest')).toBe(false);
    const lucha = outfitSpecs('ring-mask', 'female').map((spec) => spec.name);
    expect(lucha).toContain('lucha-brow');
    expect(lucha).toContain('lucha-dot-l');
    expect(lucha).toContain('lucha-dot-r');
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

  it('sells themed looks only as packs, with milestones kept out of the store', () => {
    expect(SHOP_PACKS.map((pack) => pack.productId)).toEqual([
      'kickole_pack_heroes_space',
      'kickole_pack_adventure',
      'kickole_pack_party',
      'kickole_pack_spooky',
      'kickole_pack_everything',
    ]);
    expect(packsGrantedBy('everything')).toEqual([...CONTENT_PACK_IDS, 'everything']);
    expect(EARNED_OUTFIT_IDS).toEqual([
      'kitchen-whites',
      'match-official',
      'keep-guard',
      'snow-friend',
      'spike-hood',
      'gold-legend',
    ]);
    for (const pack of SHOP_PACKS) {
      for (const id of pack.outfitIds) expect(earnedOutfit(id)).toBe(false);
      for (const id of pack.bootIds) expect(id).toBe(COWBOY_BOOT_ID);
    }
    expect(SHOP_PACKS.find((pack) => pack.id === 'party')?.bootIds).toEqual([COWBOY_BOOT_ID]);
    const fresh = normalizeLocker(null);
    expect(grantShopPack(fresh, 'heroes-space', 'dev_sim').ownedPacks).toEqual([]);
    expect(grantShopPack(fresh, 'heroes-space', 'none').ownedOutfits).toEqual([]);
    const heroes = grantShopPack(fresh, 'heroes-space', 'apple');
    expect(heroes.ownedPacks).toEqual(['heroes-space']);
    expect(heroes.ownedOutfits).toEqual(['street-hero', 'night-glider', 'alien', 'spaceman']);
    for (const id of EARNED_OUTFIT_IDS) expect(heroes.ownedOutfits).not.toContain(id);
    const all = grantShopPack(fresh, 'everything', 'google');
    expect(all.ownedPacks).toEqual([...CONTENT_PACK_IDS, 'everything']);
    expect(all.ownedBoots).toContain(COWBOY_BOOT_ID);
    expect(all.ownedOutfits).toContain('secret-agent');
    expect(all.ownedOutfits).not.toContain('gold-legend');
    const launched = grantLaunchCollection(fresh, 'apple', 'apple:launch');
    expect(launched.ownedPacks).toEqual([]);
    expect(launched.ownedOutfits).toEqual([]);
    const worn = { ...all, equippedBoot: COWBOY_BOOT_ID, equippedOutfit: 'alien' as const };
    const refunded = applyOwnedPackProducts(worn, [], 'google');
    expect(refunded.ownedPacks).toEqual([]);
    expect(refunded.ownedBoots).not.toContain(COWBOY_BOOT_ID);
    expect(refunded.equippedBoot).toBe('boot-street-classic');
    expect(refunded.equippedOutfit).toBeNull();
    const kept = applyOwnedPackProducts(
      { ...worn, bestStreak: GOLD_LEGEND_STREAK, equippedOutfit: 'gold-legend' },
      ['kickole_pack_everything'],
      'apple',
    );
    expect(kept.equippedOutfit).toBe('gold-legend');
    expect(kept.ownedPacks).toContain('everything');
    const scoring = readFileSync(new URL('../engine/scoring.ts', import.meta.url), 'utf8');
    const engine = readFileSync(new URL('../engine/engine.ts', import.meta.url), 'utf8');
    expect(scoring).not.toMatch(/outfit/);
    expect(engine).not.toMatch(/outfit/);
  });

  it('lists the packs inside Everything and says Saving only when the bundle costs less', () => {
    const includes = everythingIncludesLine();
    expect(includes).toBe('Includes Heroes & Space, Adventure, Party and Spooky.');
    expect(everythingOwnedLine([])).toBeNull();
    expect(everythingOwnedLine(['heroes-space'])).toBe('Already owned: Heroes & Space.');
    expect(everythingOwnedLine(['party', 'spooky', 'heroes-space'])).toBe('Already owned: Heroes & Space, Party and Spooky.');
    expect(everythingOwnedLine(['everything'])).toBe('Already owned: Heroes & Space, Adventure, Party and Spooky.');

    const row = (productId: string, priceMicros: number, currencyCode = 'GBP') => ({ productId, priceMicros, currencyCode });
    const packs = [
      row('kickole_pack_heroes_space', 199),
      row('kickole_pack_adventure', 199),
      row('kickole_pack_party', 199),
      row('kickole_pack_spooky', 99),
    ];
    expect(everythingSavingLabel([])).toBeNull();
    expect(everythingSavingLabel([...packs, row('kickole_pack_everything', 800)])).toBeNull();
    expect(everythingSavingLabel([...packs, row('kickole_pack_everything', 696)])).toBeNull();
    expect(everythingSavingLabel([...packs, row('kickole_pack_everything', 695)])).toBe('Saving');
    expect(everythingSavingLabel([...packs, row('kickole_pack_everything', 100, 'EUR')])).toBeNull();
    expect(everythingSavingLabel([
      ...packs.slice(0, 3),
      row('kickole_pack_spooky', 0),
      row('kickole_pack_everything', 100),
    ])).toBeNull();
    expect(includes.toLowerCase()).not.toContain('saving');
  });

  it('wears any costume on TestFlight without a store grant or dev_sim', () => {
    const start = normalizeLocker(null);
    expect(outfitSelectable(start, 'alien', false)).toBe(false);
    expect(outfitSelectable(start, 'gold-legend', true)).toBe(true);
    const worn = equipOutfit(start, 'alien', true);
    expect(worn.ok).toBe(true);
    if (worn.ok) {
      expect(worn.locker.equippedOutfit).toBe('alien');
      expect(worn.locker.ownedOutfits).toEqual([]);
      expect(worn.locker.cosmeticSource).toBe('none');
      expect(worn.locker.ownedPacks).toEqual([]);
    }
    expect(equipOutfit(start, 'alien').ok).toBe(false);
    const boots = buyOrEquipBoot(start, COWBOY_BOOT_ID, true);
    expect(boots.ok).toBe(true);
    if (boots.ok) {
      expect(boots.locker.equippedBoot).toBe(COWBOY_BOOT_ID);
      expect(boots.locker.ownedBoots).not.toContain(COWBOY_BOOT_ID);
    }
    expect(buyOrEquipBoot(start, COWBOY_BOOT_ID).ok).toBe(false);
    const kept = keepTesterWear(start, 'gold-legend', COWBOY_BOOT_ID);
    expect(kept.equippedOutfit).toBe('gold-legend');
    expect(kept.equippedBoot).toBe(COWBOY_BOOT_ID);
    expect(kept.ownedOutfits).toEqual([]);
    expect(grantStoreCosmetic(kept, 'alien', 'dev_sim').ownedOutfits).toEqual([]);
  });
});
