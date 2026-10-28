import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHILD_SAFETY_URL, PRIVACY_URL, TERMS_URL } from './site';

const PRIVACY = 'https://iqappsgroup.co.uk/kickole/privacy';
const CHILD_SAFETY = 'https://iqappsgroup.co.uk/kickole/child-safety';
const TERMS = 'https://iqappsgroup.co.uk/kickole/terms';
const MODELS_SENTENCE = 'You must not pull the footballer models out of the game or use them outside it.';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('company legal URLs', () => {
  it('points privacy and terms at the company site', () => {
    expect(PRIVACY_URL).toBe(PRIVACY);
    expect(CHILD_SAFETY_URL).toBe(CHILD_SAFETY);
    expect(TERMS_URL).toBe(TERMS);
    expect(PRIVACY_URL).not.toContain('kickole.pages.dev');
    expect(CHILD_SAFETY_URL).not.toContain('kickole.pages.dev');
    expect(TERMS_URL).not.toContain('kickole.pages.dev');
  });

  it('uses those addresses in Settings, the legal page, store notes, docs, and the iPhone build', () => {
    const screens = source('./ui/Screens.tsx');
    const legal = source('../public/legal/index.html');
    const terms = source('../legal/terms-of-use.md');
    const store = source('../docs/STORE_DATA_SAFETY.md');
    const release = source('../docs/RELEASE_VALIDATION.md');
    const testflight = source('../docs/TESTFLIGHT.md');
    const codemagic = source('../codemagic.yaml');
    const example = source('../.env.example');

    expect(screens).toMatch(/href=\{PRIVACY_URL\}[^>]*>\s*privacy notice\s*</);
    expect(screens).toMatch(/href=\{CHILD_SAFETY_URL\}[^>]*>\s*child safety statement\s*</);
    expect(screens).toMatch(/href=\{TERMS_URL\}[^>]*>\s*terms of use\s*</);
    expect(screens).not.toContain('LEGAL_URL');
    expect(screens).not.toContain('kickole.pages.dev');
    expect(legal).toContain(PRIVACY);
    expect(legal).toContain(CHILD_SAFETY);
    expect(legal).toContain(TERMS);
    expect(legal).toContain(MODELS_SENTENCE);
    expect(terms).toContain(MODELS_SENTENCE);
    expect(store).toContain(PRIVACY);
    expect(store).toContain(CHILD_SAFETY);
    expect(store).toContain(TERMS);
    expect(release).toContain(PRIVACY);
    expect(release).toContain(CHILD_SAFETY);
    expect(release).toContain(TERMS);
    expect(testflight).toContain(PRIVACY);
    expect(testflight).toContain(CHILD_SAFETY);
    expect(testflight).toContain(TERMS);
    expect(codemagic).toContain(`VITE_PRIVACY_URL: ${PRIVACY}`);
    expect(codemagic).toContain(`VITE_CHILD_SAFETY_URL: ${CHILD_SAFETY}`);
    expect(codemagic).toContain(`VITE_TERMS_URL: ${TERMS}`);
    expect(codemagic).not.toContain('kickole.pages.dev');
    expect(codemagic).not.toContain('VITE_LEGAL_URL');
    expect(example).toContain(PRIVACY);
    expect(example).toContain(CHILD_SAFETY);
    expect(example).toContain(TERMS);
    expect(example).not.toContain('kickole.pages.dev');
  });
});
