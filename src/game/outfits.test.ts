import { describe, expect, it } from 'vitest';
import { STARTER_BOOT_ID } from './catalogue';
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
  EARNED_OUTFIT_IDS,
  EARNED_BEST_SCORE,
  GOLD_LEGEND_SCORE,
  OUTFIT_IDS,
  OUTFITS,
  earnedOutfit,
  goldLegendUnlocked,
  outfitCoversBody,
} from './outfits';
import { normalizeLocker } from './shop';

describe('themed outfits', () => {
  it('keeps every look fully clothed and off any product id', () => {
    const ids = new Set<string>();
    for (const outfit of OUTFITS) {
      expect(ids.has(outfit.id)).toBe(false);
      ids.add(outfit.id);
      expect(outfitCoversBody(outfit)).toBe(true);
      expect(familySafeName(outfit.name)).toBe(true);
      expect(outfit.note.toLowerCase()).not.toContain('batman');
      expect(outfit.milestone === null || earnedOutfit(outfit.id)).toBe(true);
      expect('productId' in outfit).toBe(false);
    }
    expect(OUTFITS.find((outfit) => outfit.id === 'gold-legend')?.milestone?.kind).toBe('bestScore');
    expect(OUTFITS.find((outfit) => outfit.id === 'night-glider')?.name).toBe('Shadow Hero');
    expect(OUTFITS.map((outfit) => `${outfit.name} ${outfit.note}`).join('\n')).not.toMatch(/bat-style|night glider|party pack|store/i);
    expect(EARNED_BEST_SCORE).toEqual({
      'kitchen-whites': 1000,
      'match-official': 2500,
      'keep-guard': 4000,
      'snow-friend': 5500,
      'spike-hood': 7000,
      'gold-legend': 10000,
    });
    for (const id of EARNED_OUTFIT_IDS) {
      expect(getOutfit(id)?.milestone).toEqual({ kind: 'bestScore', target: EARNED_BEST_SCORE[id], label: 'best score' });
    }
    expect(goldLegendUnlocked(GOLD_LEGEND_SCORE - 1)).toBe(false);
    expect(goldLegendUnlocked(GOLD_LEGEND_SCORE)).toBe(true);
    expect((OUTFIT_IDS as readonly string[]).includes('stripe-bandit')).toBe(false);
    expect((OUTFIT_IDS as readonly string[]).includes('secret-agent')).toBe(true);
    expect(OUTFITS.some((outfit) => /robber|bandit/i.test(outfit.name))).toBe(false);
  });

  it('drops a saved cowboy boot and does not equip a costume from the save', () => {
    const raw = {
      ownedBoots: [STARTER_BOOT_ID, COWBOY_BOOT_ID],
      equippedBoot: COWBOY_BOOT_ID,
      ownedOutfits: ['alien', 'gold-legend'],
      equippedOutfit: 'alien',
      cosmeticSource: 'dev_sim',
    };
    const saved = normalizeLocker(raw);
    expect(saved.ownedBoots).toEqual([STARTER_BOOT_ID]);
    expect(saved.equippedBoot).toBe(STARTER_BOOT_ID);
    expect('ownedOutfits' in saved).toBe(false);
    expect('equippedOutfit' in saved).toBe(false);
    expect('cosmeticSource' in saved).toBe(false);
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
      expect(shaft && shaft.position[1] + shaft.size[1] / 2).toBeLessThanOrEqual(0.22);
    }
    expect(cowboyBootSpecs('female').find((spec) => spec.name === 'cowboy-heel')?.size[1])
      .toBe(cowboyBootSpecs('male').find((spec) => spec.name === 'cowboy-heel')?.size[1]);
    const seventies = outfitSpecs('seventies', 'female').map((spec) => spec.name);
    expect(seventies.some((name) => name.includes('sweatband'))).toBe(true);
    expect(seventies.some((name) => name.includes('moustache'))).toBe(true);
    expect(seventies.some((name) => name.includes('short'))).toBe(false);
  });
});
