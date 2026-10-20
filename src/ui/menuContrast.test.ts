import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MENU_LABEL, MENU_SCRIM_CSS, MENU_TAGLINE, menuTextContrast } from './menuContrast';

describe('menu text contrast', () => {
  it('keeps the street label and tagline at least 4.5:1 on the scrim', () => {
    expect(menuTextContrast(MENU_LABEL)).toBeGreaterThanOrEqual(4.5);
    expect(menuTextContrast(MENU_TAGLINE)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the same scrim the home screen paints behind the light type', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toContain(MENU_SCRIM_CSS);
    expect(css).toContain(MENU_LABEL);
    expect(css).toContain(MENU_TAGLINE);
  });
});
