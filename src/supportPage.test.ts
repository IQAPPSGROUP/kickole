import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUPPORT_URL } from './site';

const SUPPORT = 'https://iqappsgroup.co.uk/kickole/support';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('support page', () => {
  it('points the in-app link and the /support route at the company support page', () => {
    expect(SUPPORT_URL).toBe(SUPPORT);
    const screens = source('./ui/Screens.tsx');
    const contact = screens.slice(screens.indexOf('Contact or report a problem') - 120, screens.indexOf('Contact or report a problem'));
    expect(contact).toContain('SUPPORT_URL');
    expect(contact).not.toContain('mailto:');
    const redirects = source('../public/_redirects');
    expect(redirects).toContain(`/support  ${SUPPORT}  302`);
    expect(redirects).toContain(`/support/  ${SUPPORT}  302`);
    expect(redirects).toContain(`/support/index.html  ${SUPPORT}  302`);
  });

  it('shows a short support page with the support email and no other personal details', () => {
    const page = source('../public/support/index.html');
    expect(page).toContain('hello@iqappsgroup.co.uk');
    expect(page).toContain(SUPPORT);
    expect(page).toContain('<h1>KICKOLÉ support</h1>');
    expect(page).not.toContain('id="root"');
    expect(page).not.toContain('/src/main.tsx');
    expect(page).not.toContain('Rob Stancombe');
    expect(page).not.toContain('Wood Street');
    expect(page).not.toContain('London');
    expect(page).not.toContain('ZC266591');
    expect(page).not.toContain('privacy@');
  });
});
