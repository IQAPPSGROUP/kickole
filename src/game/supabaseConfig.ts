/**
 * Publishable Supabase project values for the Kickolé board.
 * Safe to ship in the client. This is not a service-role or secret key.
 * Vite env overrides the defaults in Cloudflare Pages and Codemagic.
 */
const DEFAULT_URL = 'https://fjcidkbwxjimvxwzaoct.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_cZICJMAPEFVMrHq6SysiEw_p_4PTVmA';

function readEnv(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export const SUPABASE_URL = readEnv('VITE_SUPABASE_URL') || DEFAULT_URL;
export const SUPABASE_PUBLISHABLE_KEY = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || DEFAULT_PUBLISHABLE_KEY;
