import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MusicDebug } from '../ui/MusicDebug';
import { fanLayout, fanRects } from '../ui/fanLayout';
import {
  MUSIC_DEBUG_TAP_COUNT,
  MUSIC_DEBUG_TAP_GAP_MS,
  boxesOverlap,
  musicDebugPanelBox,
  musicDebugRequested,
  musicDebugUnlockBox,
  nextMusicDebugTaps,
  type MusicDebugBox,
} from './musicDebug';

describe('music debug reveal', () => {
  it('opens from a debug query and stays closed otherwise', () => {
    expect(musicDebugRequested('')).toBe(false);
    expect(musicDebugRequested('?tier=low')).toBe(false);
    expect(musicDebugRequested('?debug')).toBe(true);
    expect(musicDebugRequested('musicdebug=1')).toBe(true);
  });

  it('counts five quick taps and restarts after a gap', () => {
    let count = 0;
    for (let i = 0; i < MUSIC_DEBUG_TAP_COUNT - 1; i++) count = nextMusicDebugTaps(count, 100);
    expect(count).toBe(4);
    expect(nextMusicDebugTaps(count, MUSIC_DEBUG_TAP_GAP_MS)).toBe(MUSIC_DEBUG_TAP_COUNT);
    expect(nextMusicDebugTaps(4, MUSIC_DEBUG_TAP_GAP_MS + 1)).toBe(1);
  });

  it('hides the unlock while a run is live and closes from a tap on the report', () => {
    const closed = renderToStaticMarkup(createElement(MusicDebug, { activePlay: false }));
    const live = renderToStaticMarkup(createElement(MusicDebug, { activePlay: true }));
    expect(closed).toContain('music-debug-unlock');
    expect(live).not.toContain('music-debug-unlock');
    const source = readFileSync(new URL('../ui/MusicDebug.tsx', import.meta.url), 'utf8');
    expect(source).toContain('setOpen(false)');
    expect(source).not.toContain('deviceId');
    expect(source).not.toContain('fetch(');
  });

  it('keeps the unlock and the open report off tappable controls', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const unlockRule = css.slice(css.indexOf('.music-debug-unlock {'), css.indexOf('.music-debug {'));
    expect(unlockRule).toContain('width: 10px');
    expect(unlockRule).toContain('height: 48px');
    expect(unlockRule).toContain('z-index: 15');
    const panelRule = css.slice(css.indexOf('.music-debug {'), css.indexOf('.music-debug p'));
    expect(panelRule).toContain('pointer-events: auto');
    expect(panelRule).toContain('top: 156px');
    expect(css).toMatch(/\.leaderboard-sheet \{[^}]*z-index: 90;/s);

    const screens = [
      { width: 320, height: 700, landscape: false },
      { width: 390, height: 844, landscape: false },
      { width: 700, height: 320, landscape: true },
    ];
    for (const screen of screens) {
      const unlock = musicDebugUnlockBox(false);
      const playing = musicDebugUnlockBox(true);
      const panel = musicDebugPanelBox(screen.width, screen.height);
      expect(playing).toBeNull();
      expect(unlock).not.toBeNull();
      const targets = tappableBoxes(screen.width, screen.height, screen.landscape);
      for (const target of targets) {
        if (target.blocksUnlock) {
          expect(boxesOverlap(unlock!, target.box), `${screen.width} unlock ${target.name}`).toBe(false);
        }
        if (target.blocksPanel) {
          expect(boxesOverlap(panel, target.box), `${screen.width} panel ${target.name}`).toBe(false);
        }
      }
    }
  });
});

function tappableBoxes(width: number, height: number, landscape: boolean): { name: string; box: MusicDebugBox; blocksUnlock: boolean; blocksPanel: boolean }[] {
  const chipW = Math.min(width * 0.58, 230);
  const cardW = Math.min(width * 0.92, 420);
  const hudW = landscape ? 140 : Math.min(220, width * 0.7);
  return [
    { name: 'pause', box: { x: 184, y: 12, w: 44, h: 44 }, blocksUnlock: false, blocksPanel: true },
    { name: 'song', box: { x: width - 6 - chipW, y: 100, w: chipW, h: 44 }, blocksUnlock: true, blocksPanel: true },
    { name: 'card', box: { x: (width - cardW) / 2, y: 0, w: cardW, h: Math.min(height, 520) }, blocksUnlock: true, blocksPanel: false },
    { name: 'hud', box: { x: landscape ? 16 : (width - hudW) / 2, y: landscape ? 0 : 4, w: hudW, h: 90 }, blocksUnlock: true, blocksPanel: true },
    { name: 'logo', box: { x: 22, y: 24, w: 48, h: 48 }, blocksUnlock: true, blocksPanel: false },
    ...fanRects(width, height, fanLayout(width)).map((rect) => ({
      name: rect.name,
      box: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      blocksUnlock: false,
      blocksPanel: true,
    })),
  ];
}
