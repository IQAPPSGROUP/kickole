import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOOT_MATERIALS } from '../scene/measureFootContact';
import { bootStyleSpecs, cowboyBootSpecs } from './outfitFit';
import {
  BOOT_STYLES,
  CLASSIC_BOOT_ID,
  EMPTY_BOOT_PROGRESS,
  earnedBootIds,
  noteBootPlay,
  type BootProgress,
  type BootStyleId,
} from './bootStyles';

const ALL: BootStyleId[] = [
  'boot-classic',
  'boot-wellies',
  'boot-cowboy',
  'boot-hitops',
  'boot-snow',
  'boot-space',
  'boot-knight',
  'boot-gold',
];

function progress(patch: Partial<BootProgress> = {}): BootProgress {
  return { ...EMPTY_BOOT_PROGRESS, ...patch };
}

describe('earned boot styles', () => {
  it('lists eight plain goals and never the moon-boot name', () => {
    expect(BOOT_STYLES.map((style) => style.id)).toEqual(ALL);
    expect(BOOT_STYLES.map((style) => style.hint)).toEqual([
      'Starter',
      '100 kick-ups in total',
      'Land your first Rainbow',
      '5 different tricks in one run',
      'Beat your best score 3 times',
      'Hit a x5 combo',
      '1,000 kick-ups in total',
      '2,500 kick-ups in total',
    ]);
    const text = JSON.stringify(BOOT_STYLES);
    expect(text.toLowerCase()).not.toContain('moon boot');
    expect(text).not.toMatch(/price|coin|timer|streak|random|advert/i);
    expect(BOOT_STYLES.every((style) => style.main !== style.dark)).toBe(true);
  });

  it('starts on Classic and unlocks each goal once', () => {
    expect(earnedBootIds(EMPTY_BOOT_PROGRESS)).toEqual([CLASSIC_BOOT_ID]);
    const wellies = noteBootPlay(progress({ kickUps: 99 }), { kickUps: 1 });
    expect(wellies.unlocked).toEqual(['boot-wellies']);
    expect(noteBootPlay(wellies.progress, { kickUps: 1 }).unlocked).toEqual([]);
    expect(noteBootPlay(EMPTY_BOOT_PROGRESS, { rainbow: true }).unlocked).toEqual(['boot-cowboy']);
    expect(noteBootPlay(progress({ bestTricksInRun: 4 }), { tricksInRun: 5 }).unlocked).toEqual(['boot-hitops']);
    expect(noteBootPlay(progress({ bestTricksInRun: 5 }), { tricksInRun: 3 }).unlocked).toEqual([]);
    const snow = progress({ bestBeats: 2 });
    expect(noteBootPlay(snow, { beatBest: false }).unlocked).toEqual([]);
    expect(noteBootPlay(snow, { beatBest: true }).unlocked).toEqual(['boot-snow']);
    expect(noteBootPlay(EMPTY_BOOT_PROGRESS, { combo5: true }).unlocked).toEqual(['boot-space']);
    expect(noteBootPlay(progress({ combo5: true }), { combo5: false }).progress.combo5).toBe(true);
    const knight = noteBootPlay(progress({ kickUps: 999 }), { kickUps: 1 });
    expect(knight.unlocked).toEqual(['boot-knight']);
    expect(knight.progress.kickUps).toBe(1000);
    expect(earnedBootIds(knight.progress)).toContain('boot-wellies');
    expect(noteBootPlay(progress({ kickUps: 2499 }), { kickUps: 1 }).unlocked).toEqual(['boot-gold']);
  });

  it('does not count the first score against an empty best', () => {
    const first = noteBootPlay(EMPTY_BOOT_PROGRESS, { beatBest: false, kickUps: 4 });
    expect(first.progress.bestBeats).toBe(0);
    expect(first.unlocked).not.toContain('boot-snow');
  });

  it('fits plain foot meshes inside the ankle and off the contact materials', () => {
    expect(bootStyleSpecs('boot-classic', 'male')).toEqual([]);
    expect(cowboyBootSpecs('female').map((spec) => spec.name)).toEqual([
      'cowboy-shaft',
      'cowboy-toe',
      'cowboy-heel',
      'cowboy-shaft-r',
      'cowboy-toe-r',
      'cowboy-heel-r',
    ]);
    for (const id of ALL) {
      if (id === 'boot-classic') continue;
      for (const body of ['male', 'female'] as const) {
        const specs = bootStyleSpecs(id, body);
        expect(specs.length).toBeGreaterThan(0);
        const names = specs.map((spec) => spec.name).join(' ');
        expect(names).not.toMatch(/stripe|logo|swoosh|letter|stud|lace|rivet/i);
        for (const spec of specs) {
          expect(BOOT_MATERIALS.has(spec.name)).toBe(false);
          expect(spec.bone === 'footL' || spec.bone === 'footR').toBe(true);
          expect(spec.position[1] + spec.size[1] / 2).toBeLessThanOrEqual(0.073);
        }
      }
    }
  });

  it('keeps boot progress out of submit_score', () => {
    const source = readFileSync(new URL('./supabaseLeaderboard.ts', import.meta.url), 'utf8');
    const at = source.indexOf("callRpc(rpc, 'submit_score'");
    expect(at).toBeGreaterThan(0);
    const call = source.slice(at, at + 700);
    expect(call).not.toMatch(/boot/i);
    expect(call).toContain('run_token');
  });
});
