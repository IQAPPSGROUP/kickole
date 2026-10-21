import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('music and effects volume controls', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const screens = readFileSync(new URL('./Screens.tsx', import.meta.url), 'utf8');

  it('gives each slider a 44px target and cream text', () => {
    expect(css).toMatch(/\.volume \{[^}]*min-height: 44px;/s);
    expect(css).toMatch(/\.volume input\[type="range"\] \{[^}]*min-height: 44px;/s);
    expect(css).toMatch(/\.volume span \{[^}]*color: #fffdf8;/s);
    expect(screens).toContain('Music volume');
    expect(screens).toContain('Sound effects volume');
  });
});
