// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveEnvironmentTheme } from './environment';
import {
  LOCATION_FILES,
  STREET_PROPS,
  courtFencePosts,
  courtFenceSlots,
  skyFile,
  streetPropsClearOfPlay,
} from './locations';
import { inPlayVolume } from './streetLayout';

const KTX2 = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb]);

describe('location scenery', () => {
  it('keeps three distinct themes and falls back to the street', () => {
    expect(resolveEnvironmentTheme()).toBe('street');
    expect(resolveEnvironmentTheme('court')).toBe('court');
    expect(resolveEnvironmentTheme('beach')).toBe('beach');
    expect(resolveEnvironmentTheme('street', 'court')).toBe('court');
    expect(resolveEnvironmentTheme('nope')).toBe('street');
  });

  it('points every location file at the local bundle', () => {
    for (const file of Object.values(LOCATION_FILES)) {
      expect(file.startsWith('textures/locations/') || file.startsWith('models/environment/locations/')).toBe(true);
      expect(file).not.toMatch(/https?:|polyhaven|ambientcg/i);
      expect(statSync(new URL(`../../public/${file}`, import.meta.url)).size).toBeGreaterThan(1000);
    }
  });

  it('ships a smaller JPEG sky than the HDR for each location', () => {
    const pairs = [
      [LOCATION_FILES.streetHdr, LOCATION_FILES.streetJpg],
      [LOCATION_FILES.courtHdr, LOCATION_FILES.courtJpg],
      [LOCATION_FILES.beachHdr, LOCATION_FILES.beachJpg],
    ] as const;
    for (const [hdr, jpg] of pairs) {
      const hdrBytes = statSync(new URL(`../../public/${hdr}`, import.meta.url)).size;
      const jpgBytes = statSync(new URL(`../../public/${jpg}`, import.meta.url)).size;
      const head = readFileSync(new URL(`../../public/${hdr}`, import.meta.url)).subarray(0, 11).toString('ascii');
      expect(head.startsWith('#?RADIANCE') || head.startsWith('#?RGBE')).toBe(true);
      expect(jpgBytes).toBeLessThan(hdrBytes);
      expect(jpgBytes).toBeLessThan(450_000);
      expect(hdrBytes).toBeLessThan(2_500_000);
    }
  });

  it('ships KTX2 ground maps with a smaller low tier', () => {
    for (const file of [LOCATION_FILES.trackColor, LOCATION_FILES.trackNormal, LOCATION_FILES.trackRough, LOCATION_FILES.trackColorLow, LOCATION_FILES.grassColor, LOCATION_FILES.grassNormal, LOCATION_FILES.grassRough, LOCATION_FILES.grassColorLow, LOCATION_FILES.sandColor, LOCATION_FILES.sandNormal, LOCATION_FILES.sandRough, LOCATION_FILES.sandColorLow]) {
      const bytes = readFileSync(new URL(`../../public/${file}`, import.meta.url));
      expect(bytes.subarray(0, 8).equals(KTX2)).toBe(true);
    }
    expect(statSync(new URL(`../../public/${LOCATION_FILES.trackColorLow}`, import.meta.url)).size)
      .toBeLessThan(statSync(new URL(`../../public/${LOCATION_FILES.trackColor}`, import.meta.url)).size);
    expect(statSync(new URL(`../../public/${LOCATION_FILES.sandColorLow}`, import.meta.url)).size)
      .toBeLessThan(statSync(new URL(`../../public/${LOCATION_FILES.sandColor}`, import.meta.url)).size);
    expect(statSync(new URL(`../../public/${LOCATION_FILES.grassColorLow}`, import.meta.url)).size)
      .toBeLessThan(statSync(new URL(`../../public/${LOCATION_FILES.grassColor}`, import.meta.url)).size);
  });

  it('keeps street props and the court cage outside the freestyle box', () => {
    expect(streetPropsClearOfPlay()).toBe(true);
    for (const spot of STREET_PROPS) expect(inPlayVolume(spot.x, spot.z)).toBe(false);
    for (const detail of ['sparse', 'link'] as const) {
      for (const slot of [...courtFenceSlots(detail), ...courtFencePosts(detail)]) {
        expect(inPlayVolume(slot.x, slot.z)).toBe(false);
        // The camera end stays open. Side runs may come forward; nothing crosses the near goal line.
        expect(Math.abs(slot.x) > 3.5 || slot.z < -3).toBe(true);
      }
    }
    expect(courtFenceSlots('plane')).toHaveLength(0);
  });

  it('selects the JPEG sky only on the low tier', () => {
    expect(skyFile('street', 'high')).toContain('street_docklands_1k.hdr');
    expect(skyFile('street', 'low')).toContain('street_sky.jpg');
    expect(skyFile('court', 'medium')).toContain('court_green_point_1k.hdr');
    expect(skyFile('beach', 'low')).toContain('beach_sky.jpg');
  });
});
