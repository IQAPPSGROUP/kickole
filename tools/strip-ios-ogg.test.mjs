import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IOS_OGG_DIR, isBundleOgg, stripIosOgg } from './strip-ios-ogg.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('iOS ogg copies', () => {
  it('keeps the repo ogg songs and only strips the synced iOS folder', async () => {
    const repo = await readdir(path.join(root, 'public', 'audio', 'rob'));
    expect(repo.filter((name) => name.endsWith('.ogg')).sort()).toEqual([
      'game-song-2.ogg',
      'game-song-3.ogg',
      'gameplay-instrumental.ogg',
      'menu-song.ogg',
    ]);
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['ios:sync']).toContain('npm run build:store');
    expect(pkg.scripts['ios:sync']).toContain('node tools/strip-ios-ogg.mjs');
    expect(pkg.scripts['cap:sync']).not.toContain('strip-ios-ogg');

    const scratch = await mkdtemp(path.join(tmpdir(), 'kickole-ogg-'));
    const iosDir = path.join(scratch, IOS_OGG_DIR);
    const webDir = path.join(scratch, 'public', 'audio', 'rob');
    await mkdir(iosDir, { recursive: true });
    await mkdir(webDir, { recursive: true });
    await writeFile(path.join(iosDir, 'menu-song.ogg'), 'ios-ogg');
    await writeFile(path.join(iosDir, 'menu-song.m4a'), 'ios-m4a');
    await writeFile(path.join(iosDir, 'README.md'), 'keep');
    await writeFile(path.join(webDir, 'menu-song.ogg'), 'web-ogg');

    const removed = await stripIosOgg(scratch);
    expect(removed).toEqual(['menu-song.ogg']);
    const left = await readdir(iosDir);
    expect(left).toEqual(expect.arrayContaining(['menu-song.m4a', 'README.md']));
    expect(left).not.toContain('menu-song.ogg');
    expect(await readdir(webDir)).toContain('menu-song.ogg');
    expect(isBundleOgg('../public/audio/rob/menu-song.ogg')).toBe(false);
    expect(await stripIosOgg(path.join(scratch, 'missing'))).toEqual([]);
  });
});
