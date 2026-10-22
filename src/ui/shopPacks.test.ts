import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETIC_SHOP_LINE } from '../game/outfits';

describe('shop packs screen', () => {
  it('opens the shop only from a tap and keeps the pack copy free of a currency', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    const packs = readFileSync(new URL('./ShopPacks.tsx', import.meta.url), 'utf8');
    const outfits = readFileSync(new URL('../game/outfits.ts', import.meta.url), 'utf8');
    const opens: number[] = [];
    let from = 0;
    const needle = "setOverlay('shop')";
    while (from < app.length) {
      const at = app.indexOf(needle, from);
      if (at < 0) break;
      opens.push(at);
      from = at + needle.length;
    }
    expect(opens).toHaveLength(3);
    for (const at of opens) {
      expect(app.slice(Math.max(0, at - 40), at)).toContain('onShop');
    }
    expect(outfits).toContain(COSMETIC_SHOP_LINE);
    expect(packs).toContain('COSMETIC_SHOP_LINE');
    expect(packs).toContain('RESTORE PURCHASES');
    expect(packs).toContain('EARNED IN PLAY');
    expect(packs).toContain('everythingIncludesLine');
    expect(packs).toContain('everythingOwnedLine');
    expect(packs).toContain('everythingSavingLabel');
    expect(packs).not.toMatch(/>\s*Saving\s*</);
    expect(packs).not.toMatch(/\b(coins|gems|loot|popular|gifting|timer|limited)\b|£|€|\$\d/i);
    expect(packs).not.toMatch(/stripe-bandit|bank robber/i);
  });
});