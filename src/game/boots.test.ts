import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config';
import { BOOTS, buyOrEquip, coinsForScore, getBoot, normalizeLocker } from './boots';
import { composeWindows } from './windows';

describe('boots and coins', () => {
  it('awards one coin per point and nothing for an empty run', () => {
    expect(coinsForScore(0)).toBe(0);
    expect(coinsForScore(-4)).toBe(0);
    expect(coinsForScore(12.9)).toBe(12);
  });

  it('refuses a pair the balance cannot cover and equips an owned pair for free', () => {
    const start = normalizeLocker(null);
    expect(start.equippedBoot).toBe('street');
    expect(start.ownedBoots).toEqual(['street']);
    const broke = buyOrEquip(start, 'samba');
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe('broke');
    expect(broke.locker).toEqual(start);

    const paid = buyOrEquip({ ...start, coins: 40 }, 'samba');
    expect(paid.ok).toBe(true);
    if (paid.ok) {
      expect(paid.locker.equippedBoot).toBe('samba');
      expect(paid.locker.coins).toBe(0);
      expect(paid.locker.ownedBoots).toContain('samba');
      const back = buyOrEquip(paid.locker, 'street');
      expect(back.ok).toBe(true);
      if (back.ok) {
        expect(back.locker.equippedBoot).toBe('street');
        expect(back.locker.coins).toBe(0);
      }
    }
  });

  it('keeps the starter windows equal to today and widens better pairs', () => {
    const base = DEFAULT_CONFIG.timing.perfectMs;
    const starter = getBoot('street');
    const better = getBoot('ole');
    expect(starter.perfectExtra).toBe(0);
    expect(composeWindows(DEFAULT_CONFIG.timing, starter, false).perfectMs).toBe(base);
    expect(composeWindows(DEFAULT_CONFIG.timing, better, false).perfectMs).toBe(base + better.perfectExtra);
    expect(DEFAULT_CONFIG.timing.perfectMs).toBe(base);
  });

  it('tightens a shower on top of boots without dropping below a starter shower', () => {
    const base = { ...DEFAULT_CONFIG.timing };
    for (const boot of BOOTS) {
      const open = composeWindows(base, boot, false);
      const shut = composeWindows(base, boot, true);
      expect(shut.perfectMs).toBeLessThan(open.perfectMs);
      expect(shut.perfectMs).toBeGreaterThanOrEqual(composeWindows(base, getBoot('street'), true).perfectMs);
      expect(shut.perfectMs).toBeLessThan(shut.goodMs);
      expect(shut.goodMs).toBeLessThan(shut.poorMs);
    }
    const oleShut = composeWindows(base, getBoot('ole'), true).perfectMs;
    const streetShut = composeWindows(base, getBoot('street'), true).perfectMs;
    expect(oleShut).toBeGreaterThan(streetShut);
    expect(DEFAULT_CONFIG.timing).toEqual(base);
  });
});
