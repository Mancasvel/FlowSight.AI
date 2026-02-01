
import { invoke } from '@tauri-apps/api/core';
import { createClient } from '@supabase/supabase-js';

// IMMEDIATE FEEDBACK
console.log("App.js Starting");
// alert("App.js Loaded - Validation Ready"); // Commented out to be less annoying after first success

// Error Handler
window.onerror = function (msg, url, line) {
    alert("JS Error: " + msg + "\nLine: " + line);
};

// State
let supabase = null;

// INIT
async function init() {
    try {
        console.log("Invoking initialize_pm...");
        await invoke('initialize_pm');
        console.log("Backend Initialized");
    } catch (e) {
        console.error("Backend Init Error:", e);
    }

    setupSupabase();
    setupSupabase();
    setupAuthUI();
    setupDashboardUI();

    // Check for existing session
    if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            console.log("Session restored:", session.user.email);
            document.getElementById('loginOverlay').classList.add('hidden');
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                document.getElementById('loginOverlay').classList.add('hidden');
            } else {
                document.getElementById('loginOverlay').classList.remove('hidden');
            }
        });
    }
}

function setupSupabase() {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLIC_KEY;
    if (url && key) {
        supabase = createClient(url, key);
        console.log("Supabase Client Created");

        // Subscribe to Realtime
        const channel = supabase.channel('room1');
        channel.on('broadcast', { event: 'fingerprint' }, (event) => {
            console.log("Received fingerprint:", event.payload);
            handleFingerprint(event.payload);
        }).subscribe((status) => {
            console.log("Supabase Channel Status:", status);
        });
    }
}

async function handleFingerprint(data) {
    try {
        console.log("Saving fingerprint to SQLite...", data.dimension);
        // Call Rust command
        await invoke('save_fingerprint_report', {
            developerName: data.developer_name || "Unknown",
            vector: data.vector,
            dimension: data.dimension,
            appName: data.metadata?.app_name,
            windowTitle: data.metadata?.window_title,
            timestamp: data.timestamp
        });
        console.log("Fingerprint saved!");
    } catch (e) {
        console.error("Failed to save fingerprint:", e);
    }
}

function setupAuthUI() {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authError = document.getElementById('authError');

    // Tabs
    tabLogin.onclick = () => {
        tabLogin.style.borderBottom = "2px solid #3b82f6";
        tabLogin.style.color = "white";
        tabRegister.style.borderBottom = "none";
        tabRegister.style.color = "#94a3b8";
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        authError.style.display = 'none';
        authError.textContent = "";
    };

    tabRegister.onclick = () => {
        tabRegister.style.borderBottom = "2px solid #10b981";
        tabRegister.style.color = "white";
        tabLogin.style.borderBottom = "none";
        tabLogin.style.color = "#94a3b8";
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        authError.style.display = 'none';
        authError.textContent = "";
    };

    // Login via Supabase
    document.getElementById('loginBtn').onclick = async () => {
        const email = document.getElementById('loginUser').value; // Treating username as email for Supabase usually
        const pass = document.getElementById('loginPass').value;
        if (!email || !pass) return alert("Please fill all fields");

        const isEmail = email.includes("@");
        const finalEmail = isEmail ? email : `${email}@example.com`; // Fallback for simple usernames

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: finalEmail,
                password: pass,
            });

            if (error) throw error;
            console.log("Logged in:", data);
        } catch (e) {
            // BACKDOOR / BYPASS for "Email not confirmed" if requested
            if (e.message && e.message.includes("Email not confirmed")) {
                console.warn("Bypassing Email Confirmation restriction as requested.");
                localStorage.setItem('pm_user', finalEmail); // Set local user anyway
                document.getElementById('loginOverlay').classList.add('hidden');
                return;
            }

            authError.textContent = e.message;
            authError.style.display = 'block';
        }
    };

    // Register via Supabase
    document.getElementById('registerBtn').onclick = async () => {
        const email = document.getElementById('regUser').value;
        const pass = document.getElementById('regPass').value;
        if (!email || !pass) return alert("Please fill all fields");

        const isEmail = email.includes("@");
        const finalEmail = isEmail ? email : `${email}@example.com`;

        try {
            const { data, error } = await supabase.auth.signUp({
                email: finalEmail,
                password: pass,
            });

            if (error) throw error;

            alert("Registration successful! Check your email if confirmation is enabled, or login now.");
            tabLogin.click();
        } catch (e) {
            authError.textContent = e.message;
            authError.style.display = 'block';
        }
    };

    // Generate Data (Local Mock - Keep for dev?)
    // Converting to just fill the form for convenience
    document.getElementById('genDataLink').onclick = (e) => {
        e.preventDefault();
        document.getElementById('loginUser').value = "admin@flowsight.ai";
        document.getElementById('loginPass').value = "password123";
        document.getElementById('regUser').value = "admin@flowsight.ai";
        document.getElementById('regPass').value = "password123";
    };
}

function setupDashboardUI() {
    // 1. Stats & Config
    refreshData();
    setInterval(refreshData, 5000); // Poll every 5s

    // 2. New Key
    document.getElementById('newKeyBtn').onclick = async () => {
        if (confirm("Generate new API Key? Old keys will stop working immediately.")) {
            try {
                const newKey = await invoke('generate_api_key');
                document.getElementById('apiKeyDisplay').textContent = newKey;
            } catch (e) {
                alert("Error: " + e);
            }
        }
    };

    // 3. Server Control
    const startBtn = document.getElementById('startServerBtn');
    const stopBtn = document.getElementById('stopServerBtn');
    const statusText = document.getElementById('serverStatusText');
    const dot = document.getElementById('serverDot');

    startBtn.onclick = async () => {
        try {
            const msg = await invoke('start_server');
            console.log(msg);
            checkServerStatus();
        } catch (e) {
            alert("Error: " + e);
        }
    };

    stopBtn.onclick = async () => {
        try {
            await invoke('stop_server');
            checkServerStatus();
        } catch (e) {
            alert("Error: " + e);
        }
    };

    // 4. Manual Refresh
    document.getElementById('refreshBtn').onclick = refreshData;

    // Check status immediately
    checkServerStatus();
    setInterval(checkServerStatus, 5000);
}

async function refreshData() {
    try {
        // Config
        const config = await invoke('get_config');
        document.getElementById('teamName').value = config.team_name || "";
        document.getElementById('serverPort').value = config.server_port || 8080;
        document.getElementById('apiKeyDisplay').textContent = config.api_key || "No key generated";

        // Stats
        const stats = await invoke('get_stats');
        document.getElementById('statDevs').textContent = stats.total_developers || 0;
        document.getElementById('statOnline').textContent = stats.online_developers || 0;
        document.getElementById('statReports').textContent = stats.total_reports || 0;
        document.getElementById('statToday').textContent = stats.reports_today || 0;

        // Devs List
        const devs = await invoke('get_developers');
        const devList = document.getElementById('developersList');
        if (devs && devs.length > 0) {
            devList.innerHTML = devs.map(d => `
                <div class="developer-item">
                    <div class="dev-info">
                        <div class="dev-status ${d.is_online ? 'online' : ''}"></div>
                        <div>
                            <div class="dev-name">${d.name}</div>
                            <div class="dev-id">${d.id}</div>
                        </div>
                    </div>
                    <div style="font-size:12px;color:#64748b;">
                        ${d.last_seen_at?.split('T')[1]?.split('.')[0] || 'Offline'}
                    </div>
                </div>
            `).join('');
        }

        // Reports List (Activity Feed)
        const reports = await invoke('get_reports', { limit: 20 });
        const repList = document.getElementById('reportsList');
        if (reports && reports.length > 0) {
            repList.innerHTML = reports.map(r => `
                <div class="report-item">
                    <div class="report-header">
                        <span class="report-dev">${r.developer_name}</span>
                        <span class="report-time">${r.created_at?.split('T')[1]?.split('.')[0]}</span>
                    </div>
                    <div class="activity-badge coding">${r.activity_type}</div>
                    <div class="report-desc">${r.description}</div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error("Refresh Error:", e);
    }
}

async function checkServerStatus() {
    try {
        const status = await invoke('get_server_status');
        const running = status.running;
        const dot = document.getElementById('serverDot');
        const txt = document.getElementById('serverStatusText');
        const startBtn = document.getElementById('startServerBtn');
        const stopBtn = document.getElementById('stopServerBtn');

        if (running) {
            dot.classList.add('running');
            txt.textContent = `Running on port ${status.port}`;
            txt.style.color = 'var(--success)';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
        } else {
            dot.classList.remove('running');
            txt.textContent = 'Server stopped';
            txt.style.color = 'var(--text-secondary)';
            startBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
        }
    } catch (e) {
        console.error("Status Check Error:", e);
    }
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Global exports for debugging
window.invoke = invoke;
