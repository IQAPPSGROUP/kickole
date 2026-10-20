import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Review harness only. Not part of the game build. */
export default defineConfig({
  root,
  publicDir: path.resolve(root, '../../public'),
  server: { host: '127.0.0.1', port: 4177, strictPort: true },
});
