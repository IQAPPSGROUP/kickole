/**
 * Public URLs for the app's legal pages.
 *
 * The privacy notice and terms are published from `public/legal/index.html`, so in
 * the browser they sit next to the app. In the native shell the page origin is
 * `capacitor://localhost`, which has no hosted copy, so set VITE_LEGAL_URL in
 * Cloudflare Pages and Codemagic to the public address of `/legal/`.
 *
 * The link is only rendered when this resolves to something, so a broken or
 * placeholder URL can never ship.
 */
const DEFAULT_LEGAL_PATH = '/legal/';

function readEnv(name: 'VITE_LEGAL_URL'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function originLegalUrl(): string {
  if (typeof window === 'undefined') return '';
  const { origin } = window.location;
  // Only http(s) origins have the published page; the Capacitor shell does not.
  if (!/^https?:$/.test(window.location.protocol)) return '';
  try {
    return new URL(DEFAULT_LEGAL_PATH, origin).href;
  } catch {
    return '';
  }
}

export const LEGAL_URL = readEnv('VITE_LEGAL_URL') || originLegalUrl();
