/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ENVIRONMENT_THEME?: string;
  readonly VITE_LEGACY_LOCATIONS?: string;
  readonly VITE_USE_GLB_CHARACTER?: string;
  readonly VITE_ALLOW_MOCK?: string;
  readonly VITE_PRIVACY_URL?: string;
  readonly VITE_TERMS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
