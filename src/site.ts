/**
 * Public URLs for the privacy notice and the terms of use.
 *
 * Both live on the company site. The browser build and the iPhone build use
 * these addresses. The iPhone shell origin is capacitor://localhost, so it
 * has no copy of the pages of its own.
 *
 * Codemagic can set VITE_PRIVACY_URL and VITE_TERMS_URL. When those are
 * unset, the company-site addresses below are used.
 */
const COMPANY_PRIVACY_URL = 'https://iqappsgroup.co.uk/kickole/privacy';
const COMPANY_TERMS_URL = 'https://iqappsgroup.co.uk/kickole/terms';

function readUrl(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export const PRIVACY_URL = readUrl(import.meta.env.VITE_PRIVACY_URL, COMPANY_PRIVACY_URL);
export const TERMS_URL = readUrl(import.meta.env.VITE_TERMS_URL, COMPANY_TERMS_URL);
