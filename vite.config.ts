import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { assertStoreBuildOmitsMock } from './src/game/releaseBuildGuard.ts';

export default defineConfig(() => {
  assertStoreBuildOmitsMock(process.env);
  return {
    base: './',
    plugins: [react()],
    build: { chunkSizeWarningLimit: 1500 },
  };
});
