import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App IDs must match App Store Connect / Play Console listings owned by IQ Apps Group.
 * No store credentials are embedded here — configure signing in Xcode / Play App Signing.
 */
const config: CapacitorConfig = {
  appId: 'com.iqappsgroup.kickole',
  appName: 'Kickolé',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
