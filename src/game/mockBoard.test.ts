import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mockBoardAllowed, mockBoardFromSearch, mockCrowdFromSearch, type MockBoardEnv } from './mockBoard';
import { assertStoreBuildOmitsMock } from './releaseBuildGuard';

const production: MockBoardEnv = { MODE: 'production' };
const preview: MockBoardEnv = { MODE: 'production', VITE_ALLOW_MOCK: '1' };
const development: MockBoardEnv = { MODE: 'development' };

describe('mock board gate', () => {
  it('honours ?mockBoard=1 in development and on an explicit preview build', () => {
    expect(mockBoardFromSearch('?mockBoard=1', development)).toBe(true);
    expect(mockBoardFromSearch('?mockBoard=1&x=2', preview)).toBe(true);
    expect(mockBoardAllowed(preview)).toBe(true);
  });

  it('ignores the query in a production build unless VITE_ALLOW_MOCK=1', () => {
    expect(mockBoardFromSearch('?mockBoard=1', production)).toBe(false);
    expect(mockBoardFromSearch('?mockBoard=1', { MODE: 'production', VITE_ALLOW_MOCK: '' })).toBe(false);
    expect(mockBoardFromSearch('?mockBoard=0', development)).toBe(false);
    expect(mockBoardFromSearch('', development)).toBe(false);
    expect(mockCrowdFromSearch('?mockBoard=1&mockPlayers=8', development)).toBe(8);
    expect(mockCrowdFromSearch('?mockPlayers=8', development)).toBeUndefined();
    expect(mockCrowdFromSearch('?mockBoard=1&mockPlayers=8', production)).toBeUndefined();
    expect(mockCrowdFromSearch('?mockBoard=1&mockPlayers=nope', development)).toBeUndefined();
  });

  it('keeps the flag off main and off the Capacitor release scripts', () => {
    const workflow = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
    const allowStep = workflow.slice(workflow.indexOf('Allow the review mock'));
    expect(allowStep.startsWith('Allow the review mock')).toBe(true);
    expect(allowStep).toContain("github.ref_name != 'main'");
    expect(allowStep).toContain('VITE_ALLOW_MOCK=1');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    for (const name of ['build', 'build:store', 'ios:sync', 'cap:sync', 'cap:android', 'cap:ios']) {
      expect(pkg.scripts[name]).not.toContain('VITE_ALLOW_MOCK');
    }
    expect(pkg.scripts['build:store']).toBe('KICKOLE_STORE_BUILD=1 npm run build');
    expect(pkg.scripts['ios:sync']).toContain('npm run build:store');
    expect(pkg.scripts['cap:sync']).toContain('npm run build:store');
    expect(pkg.scripts['cap:android']).toContain('npm run cap:sync');
    expect(pkg.scripts['cap:ios']).toContain('npm run cap:sync');
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('mockBoardFromSearch(');
    expect(app).not.toContain("get('mockBoard')");
  });

  it('refuses a store or Capacitor build that has VITE_ALLOW_MOCK set', () => {
    expect(() => assertStoreBuildOmitsMock({ KICKOLE_STORE_BUILD: '1', VITE_ALLOW_MOCK: '1' })).toThrow(/VITE_ALLOW_MOCK/);
    expect(() => assertStoreBuildOmitsMock({ KICKOLE_STORE_BUILD: '1', VITE_ALLOW_MOCK: 'true' })).toThrow(/VITE_ALLOW_MOCK/);
    expect(() => assertStoreBuildOmitsMock({ KICKOLE_STORE_BUILD: '1' })).not.toThrow();
    expect(() => assertStoreBuildOmitsMock({ KICKOLE_STORE_BUILD: '1', VITE_ALLOW_MOCK: '' })).not.toThrow();
    expect(() => assertStoreBuildOmitsMock({ VITE_ALLOW_MOCK: '1' })).not.toThrow();

    const storeFiles = [
      'codemagic.yaml',
      '.github/workflows/ios-archive.yml',
      '.github/workflows/validate.yml',
    ];
    for (const file of storeFiles) {
      const source = readFileSync(file, 'utf8');
      const assignments = source.split('\n').filter((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) return false;
        if (trimmed.includes('${VITE_ALLOW_MOCK')) return false;
        return /VITE_ALLOW_MOCK\s*=\s*\S/.test(trimmed) || /VITE_ALLOW_MOCK\s*:\s*\S/.test(trimmed);
      });
      expect(assignments, file).toEqual([]);
    }
    const codemagic = readFileSync('codemagic.yaml', 'utf8');
    expect(codemagic.split('VITE_ALLOW_MOCK must not be set for a store build.').length - 1).toBe(2);
    expect(readFileSync('.github/workflows/ios-archive.yml', 'utf8')).toContain('npm run ios:sync');
    const validate = readFileSync('.github/workflows/validate.yml', 'utf8');
    expect(validate).toContain('npm run build:store');
    expect(validate).toContain('VITE_ALLOW_MOCK must not be set for a Capacitor build.');
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('assertStoreBuildOmitsMock(process.env)');
  });

  it('stops vite before bundling a store build that sets the flag', async () => {
    const previousStore = process.env.KICKOLE_STORE_BUILD;
    const previousAllow = process.env.VITE_ALLOW_MOCK;
    process.env.KICKOLE_STORE_BUILD = '1';
    process.env.VITE_ALLOW_MOCK = '1';
    try {
      await expect(build({
        configFile: path.resolve('vite.config.ts'),
        logLevel: 'silent',
        build: { write: false },
      })).rejects.toThrow(/VITE_ALLOW_MOCK must not be set/);
    } finally {
      if (previousStore === undefined) delete process.env.KICKOLE_STORE_BUILD;
      else process.env.KICKOLE_STORE_BUILD = previousStore;
      if (previousAllow === undefined) delete process.env.VITE_ALLOW_MOCK;
      else process.env.VITE_ALLOW_MOCK = previousAllow;
    }
  });
});

describe('production bundle mock board', () => {
  let outDir = '';
  let release: typeof import('./mockBoard');

  beforeAll(async () => {
    outDir = await mkdtemp(path.join(tmpdir(), 'kickole-mock-board-'));
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllow = process.env.VITE_ALLOW_MOCK;
    process.env.NODE_ENV = 'production';
    delete process.env.VITE_ALLOW_MOCK;
    try {
      await build({
        configFile: false,
        mode: 'production',
        logLevel: 'silent',
        build: {
          outDir,
          emptyOutDir: true,
          lib: {
            entry: path.resolve('src/game/mockBoard.ts'),
            formats: ['es'],
            fileName: 'mockBoard',
          },
        },
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousAllow === undefined) delete process.env.VITE_ALLOW_MOCK;
      else process.env.VITE_ALLOW_MOCK = previousAllow;
    }
    release = await import(pathToFileURL(path.join(outDir, 'mockBoard.js')).href) as typeof import('./mockBoard');
  }, 30_000);

  afterAll(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it('ignores ?mockBoard=1 the way a Capacitor release build does', () => {
    expect(release.mockBoardFromSearch('?mockBoard=1')).toBe(false);
    expect(release.mockBoardAllowed()).toBe(false);
  });
});
