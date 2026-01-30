
import { defineConfig } from "vite";
import path from "path";
import dotenv from "dotenv";

// Load .env.local from root
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_PUBLIC_KEY': JSON.stringify(process.env.VITE_SUPABASE_PUBLIC_KEY),
  },
  root: 'src/renderer',
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  envDir: '../../',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
