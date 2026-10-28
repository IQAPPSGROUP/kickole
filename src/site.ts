/**
 * Public URLs for the privacy notice, the child safety statement, and the terms of use.
 *
 * They live on the company site. The browser build and the iPhone build use
 * these addresses. The iPhone shell origin is capacitor://localhost, so it
 * has no copy of the pages of its own.
 *
 * Codemagic can set VITE_PRIVACY_URL, VITE_CHILD_SAFETY_URL, and VITE_TERMS_URL.
 * When those are unset, the company-site addresses below are used.
 */
const COMPANY_PRIVACY_URL = 'https://www.iqappsgroup.co.uk/kickole/privacy';
const COMPANY_CHILD_SAFETY_URL = 'https://www.iqappsgroup.co.uk/kickole/child-safety';
const COMPANY_TERMS_URL = 'https://www.iqappsgroup.co.uk/kickole/terms';

function readUrl(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

export const PRIVACY_URL = readUrl(import.meta.env.VITE_PRIVACY_URL, COMPANY_PRIVACY_URL);
export const CHILD_SAFETY_URL = readUrl(import.meta.env.VITE_CHILD_SAFETY_URL, COMPANY_CHILD_SAFETY_URL);
export const TERMS_URL = readUrl(import.meta.env.VITE_TERMS_URL, COMPANY_TERMS_URL);
