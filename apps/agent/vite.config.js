import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  publicDir: 'public',
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
