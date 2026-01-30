import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    publicDir: 'public',
    server: {
        port: 1421,
        strictPort: true,
    },
    build: {
        outDir: '../../dist',
        emptyOutDir: true,
    },
});
