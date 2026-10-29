import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrivacyNotice, privacyPlain } from './PrivacyNotice';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('privacy notice v1.2', () => {
  const markdown = source('../../legal/privacy-notice.md');
  const hosted = source('../../public/legal/index.html');
  const privacyHtml = hosted.slice(
    hosted.indexOf('<h1>KICKOLÉ privacy notice</h1>'),
    hosted.indexOf('<hr class="sep">'),
  );
  const manifest = source('../../ios/App/App/PrivacyInfo.xcprivacy');

  it('uses the same approved words in the app and on the hosted page', () => {
    expect(markdown).toContain('Version 1.2. Last updated 29 October 2026. Replaces: version 1.1.');
    expect(markdown).not.toContain('cartoon');
    expect(markdown).not.toContain('DRAFT');
    expect(markdown).toContain('A leaderboard only appears once it has 20 or more players.');
    expect(markdown).toContain('the flag shown beside your nickname');
    expect(privacyPlain(renderToStaticMarkup(PrivacyNotice()))).toBe(privacyPlain(markdown));
    expect(privacyPlain(privacyHtml)).toBe(privacyPlain(markdown));
    expect(hosted).toContain('<h1>KICKOLÉ terms of use</h1>');
    expect(hosted).toContain('<p>Version 1.0. Last updated 28 October 2026.</p>');
    expect(hosted).toContain('<p>Version 1.0. Last updated 25 October 2026.</p>');
    expect(hosted).toContain('<h1>KICKOLÉ child safety statement</h1>');
    expect(hosted).not.toContain('<p>  ');
    expect(hosted).toContain('identify anyone, or to advertise');
    expect(hosted).toContain('We will try to keep them running');
    expect(hosted).toContain('nothing to spend money on inside the game');
    expect(hosted).toContain('href="https://www.iqappsgroup.co.uk/kickole/licences/music"');
    expect(hosted).toContain('href="https://www.iqappsgroup.co.uk/kickole/licences/models"');
    expect(hosted).toContain('>model licence</a> are linked from this page and from Settings.');
    expect(hosted).not.toContain('picture licence');
    const settings = source('./Screens.tsx');
    expect(settings).toContain('className="licence-link" href="https://www.iqappsgroup.co.uk/kickole/licences/music" target="_blank" rel="noopener noreferrer">Music licence');
    expect(settings).toContain('className="licence-link" href="https://www.iqappsgroup.co.uk/kickole/licences/models" target="_blank" rel="noopener noreferrer">Model licence');
    expect(settings).not.toContain('picture licence');
    const css = source('../styles.css');
    expect(css).toMatch(/\.help a\.licence-link \{[^}]*word-break: normal/);
    expect(settings).not.toContain('public/audio/LICENSE.txt');
    expect(settings).not.toContain('kickole.pages.dev');
  });

  it('declares nickname, user id, score and chosen country, and not a separate device id', () => {
    expect(manifest).toContain('NSPrivacyCollectedDataTypeName');
    expect(manifest).toContain('NSPrivacyCollectedDataTypeUserID');
    expect(manifest).toContain('NSPrivacyCollectedDataTypeGameplayContent');
    expect(manifest).toContain('NSPrivacyCollectedDataTypeOtherUserContent');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypeDeviceID');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypeCoarseLocation');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypePreciseLocation');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypeContacts');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypePurchaseHistory');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypeProductInteraction');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypeAdvertisingData');
    expect(manifest).toContain('NSPrivacyCollectedDataTypeOtherDataTypes');
    expect(manifest).toContain('NSPrivacyCollectedDataTypePurposeAppFunctionality');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypePurposeAnalytics');
    expect(manifest).not.toContain('NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising');
    expect(manifest.match(/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/g)).toHaveLength(5);
    expect(manifest.match(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/g)).toHaveLength(5);
    expect(manifest).toContain('<key>NSPrivacyTracking</key>\n\t<false/>');
  });
});