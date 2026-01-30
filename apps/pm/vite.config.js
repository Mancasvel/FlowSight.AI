import { defineConfig, loadEnv } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, path.resolve(__dirname, "../../"), "");

    return {
        root: "src",
        publicDir: "public",
        server: {
            host: "127.0.0.1",
            port: 1421,
            strictPort: true,
        },
        envDir: "../../",
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
            'import.meta.env.VITE_SUPABASE_PUBLIC_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLIC_KEY),
        },
        build: {
            outDir: "../../dist",
            emptyOutDir: true,
        },
    };
});