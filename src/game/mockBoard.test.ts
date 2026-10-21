import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mockBoardAllowed, mockBoardFromSearch, type MockBoardEnv } from './mockBoard';

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
  });

  it('keeps the flag off main and off the Capacitor release scripts', () => {
    const workflow = readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
    const allowStep = workflow.slice(workflow.indexOf('Allow the review mock'));
    expect(allowStep.startsWith('Allow the review mock')).toBe(true);
    expect(allowStep).toContain("github.ref_name != 'main'");
    expect(allowStep).toContain('VITE_ALLOW_MOCK=1');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    for (const name of ['build', 'ios:sync', 'cap:sync', 'cap:android', 'cap:ios']) {
      expect(pkg.scripts[name]).not.toContain('VITE_ALLOW_MOCK');
    }
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('mockBoardFromSearch(');
    expect(app).not.toContain("get('mockBoard')");
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
