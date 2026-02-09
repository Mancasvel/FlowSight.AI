const https = require('https');
const path = require('path');
const fs = require('fs');

// Try .env.local first, then .env
const envLocalPath = path.resolve(__dirname, '.env.local');
const envPath = path.resolve(__dirname, '.env');

if (fs.existsSync(envLocalPath)) {
    require('dotenv').config({ path: envLocalPath });
} else {
    require('dotenv').config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLIC_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Error: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLIC_KEY must be set in .env or .env.local");
    process.exit(1);
}

const url = `${supabaseUrl}/rest/v1/`;
const options = {
    headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
    }
};

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        // Pretty print if possible, otherwise just raw
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log(data);
        }
    });
}).on('error', (e) => {
    console.error("Error:", e);
});
