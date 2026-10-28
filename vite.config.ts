import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { assertStoreBuildOmitsMock } from './src/game/releaseBuildGuard.ts';

const threeHook = fileURLToPath(new URL('./tools/three-esm-require.cjs', import.meta.url));

export default defineConfig(() => {
  assertStoreBuildOmitsMock(process.env);
  return {
    base: './',
    plugins: [react()],
    test: {
      execArgv: ['--require', threeHook],
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'three',
                test: /node_modules[\\/](?:three|@react-three)[\\/]/,
              },
            ],
          },
        },
      },
    },
  };
});
