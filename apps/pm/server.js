
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardcoded Environment (Fallback)
const env = {
    VITE_SUPABASE_URL: "https://dzpyrdxelcgfpmcdojvb.supabase.co",
    VITE_SUPABASE_PUBLIC_KEY: "sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ",
    VITE_PM_URL: "http://localhost:8080"
};

// Try to load .env.local manually without dotenv
try {
    const envPath = path.resolve(__dirname, '../../.env.local');
    if (fs.existsSync(envPath)) {
        console.log("Loading .env.local from " + envPath);
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            if (!line || line.startsWith('#')) return;
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                let val = parts.slice(1).join('=').trim();
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                env[key] = val;
            }
        });
    }
} catch (e) {
    console.error("Failed to load .env.local, using defaults", e);
}

// Set process.env
Object.assign(process.env, env);

const app = express();
const PORT = 1421;

app.use(cors());
app.use(express.static(path.join(__dirname, 'src')));
app.use(express.static(path.join(__dirname, 'public')));

// Mock Vite Env Injection
app.get('/env.js', (req, res) => {
    const clientEnv = {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLIC_KEY: process.env.VITE_SUPABASE_PUBLIC_KEY
    };
    res.type('application/javascript');
    res.send(`window.process = { env: ${JSON.stringify(clientEnv)} };`);
});

// Express 5 requires proper regexp or string for wildcard
// For 'all', use string if not capturing, or regexp if capturing.
app.get(/(.*)/, (req, res) => {
    // Serve index.html for SPA, injecting the env script
    let html = fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf-8');

    // Inject Env Script before head
    html = html.replace('<head>', '<head><script src="/env.js"></script>');

    // Fix imports for browser: Revert specific node_modules back to esm.sh if needed
    // But since we installed them locally, we need to serve them or use esm.sh.
    // Express static doesn't serve node_modules by default.
    // Simplest approach: Use esm.sh for browser.

    html = html.replace(/@tauri-apps\/api\/core/g, 'https://esm.sh/@tauri-apps/api@2.0.0/core');
    html = html.replace(/@supabase\/supabase-js/g, 'https://esm.sh/@supabase/supabase-js@2.39.0');

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`PM Dashboard running at http://localhost:${PORT}`);
});
