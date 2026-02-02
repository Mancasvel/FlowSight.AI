
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
        channel.on('broadcast', { event: 'activity_log' }, (event) => {
            console.log("Received activity:", event.payload);
            handleActivityLog(event.payload);
        }).subscribe((status) => {
            console.log("Supabase Channel Status:", status);
        });
    }
}

async function handleActivityLog(data) {
    try {
        console.log("Saving activity to SQLite...");
        await invoke('save_activity_log', {
            developerName: data.developer_name || "Unknown",
            deviceId: data.device_id || "unknown_device",
            description: data.metadata?.ai_summary || "No description",
            activityType: "active_work", // Default type
            timestamp: data.timestamp
        });
        console.log("Activity saved!");

        if (!document.getElementById('teamView').classList.contains('hidden')) {
            loadTeamGrid();
        }
    } catch (e) {
        console.error("Failed to save activity:", e);
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

    // Login (Hybrid: try Supabase, then Local)
    document.getElementById('loginBtn').onclick = async () => {
        const username = document.getElementById('loginUser').value;
        const pass = document.getElementById('loginPass').value;
        const remember = document.getElementById('rememberMe').checked;

        if (!username || !pass) return alert("Please fill all fields");

        try {
            // 1. Try Local Login (PM Backend)
            const token = await invoke('login_user', { username, password: pass });
            if (remember) localStorage.setItem('pm_token', token);
            else localStorage.removeItem('pm_token');

            document.getElementById('loginOverlay').classList.add('hidden');
            loadTeamGrid();
        } catch (e) {
            console.warn("Local login failed:", e);
            // 2. Fallback to Supabase (if needed, or just report error)
            // For now, let's just report the error from Local, as Supabase logic was mostly leftover
            authError.textContent = e || "Invalid credentials";
            authError.style.display = 'block';
        }
    };

    // Register via Local Backend
    document.getElementById('registerBtn').onclick = async () => {
        const email = document.getElementById('regUser').value;
        const pass = document.getElementById('regPass').value;
        if (!email || !pass) return alert("Please fill all fields");

        try {
            // Call Rust command
            await invoke('register_user', { username: email, password: pass });

            alert("Registration successful! Please login.");
            tabLogin.click();
        } catch (e) {
            authError.textContent = e || "Registration failed";
            authError.style.display = 'block';
        }
    };

    // Check Token on Load
    const savedToken = localStorage.getItem('pm_token');
    if (savedToken) {
        // verify_session
        invoke('verify_session', { token: savedToken }).then(isValid => {
            if (isValid) {
                console.log("Session verified");
                document.getElementById('loginOverlay').classList.add('hidden');
            } else {
                localStorage.removeItem('pm_token');
            }
        }).catch(console.error);
    }

    // Mock Data
    document.getElementById('genDataLink').onclick = (e) => {
        e.preventDefault();
        document.getElementById('loginUser').value = "admin";
        document.getElementById('loginPass').value = "password123";
    };
}

function setupDashboardUI() {
    console.log("Setting up Dashboard UI...");
    try {
        // 0. View Logic (High Priority)
        const btnRefreshTeam = document.getElementById('refreshTeamBtn');
        const btnBack = document.getElementById('backBtn');
        const btnRefreshDetail = document.getElementById('refreshDetailBtn');

        if (btnRefreshTeam) btnRefreshTeam.onclick = loadTeamGrid;
        if (btnBack) btnBack.onclick = () => {
            document.getElementById('detailView').classList.add('hidden');
            document.getElementById('teamView').classList.remove('hidden');
            loadTeamGrid();
        };
        if (btnRefreshDetail) btnRefreshDetail.onclick = () => {
            if (currentDevId) loadUserDetail(currentDevId);
        };
        console.log("View Logic attached");

        // 1. New Key
        const btnNewKey = document.getElementById('newKeyBtn');
        if (btnNewKey) btnNewKey.onclick = async () => {
            if (confirm("Generate new API Key? Old keys will stop working immediately.")) {
                try {
                    const newKey = await invoke('generate_api_key');
                    document.getElementById('apiKeyDisplay').textContent = newKey;
                } catch (e) {
                    alert("Error: " + e);
                }
            }
        };

        // 2. Mock Data Link
        const linkGenData = document.getElementById('genDataLink');
        if (linkGenData) linkGenData.onclick = async (e) => {
            e.preventDefault();
            try {
                await invoke('generate_test_data');
                alert("Mock Data Generated! Refreshing...");
                document.getElementById('loginOverlay').classList.add('hidden');
                loadTeamGrid();
            } catch (err) {
                alert("Error generating data: " + err);
            }
        };

        // 3. Server Control
        const startBtn = document.getElementById('startServerBtn');
        const stopBtn = document.getElementById('stopServerBtn');

        if (startBtn) startBtn.onclick = async () => {
            try {
                const msg = await invoke('start_server');
                console.log(msg);
                checkServerStatus();
            } catch (e) {
                alert("Error: " + e);
            }
        };

        if (stopBtn) stopBtn.onclick = async () => {
            try {
                await invoke('stop_server');
                checkServerStatus();
            } catch (e) {
                alert("Error: " + e);
            }
        };

        // 4. Initial Load
        checkServerStatus();
        loadTeamGrid();
        setInterval(loadTeamGrid, 10000);

    } catch (e) {
        console.error("Setup UI Error:", e);
        alert("UI Setup Error: " + e);
    }
}

let currentDevId = null;

async function loadTeamGrid() {
    // Only refresh if team view is active
    if (document.getElementById('teamView').classList.contains('hidden')) return;

    try {
        const devs = await invoke('get_developers');
        const grid = document.getElementById('teamGrid');

        if (!devs || devs.length === 0) {
            grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <span class="material-icons">group_off</span>
                <p>No team members found.</p>
            </div>`;
            return;
        }

        grid.innerHTML = devs.map(d => `
            <div class="stat-card" style="cursor:pointer; transition: transform 0.2s;" onclick="window.openDetail('${d.id}', '${d.name}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span class="dev-status ${d.is_online ? 'online' : ''}" style="width:12px; height:12px;"></span>
                    <span style="font-size:12px; color:#64748b;">${d.is_online ? 'Online' : 'Offline'}</span>
                </div>
                <div class="value" style="font-size:20px; font-weight:600; margin-bottom:5px;">${d.name}</div>
                <div style="font-size:12px; color:#64748b; margin-bottom:15px;">ID: ${d.id.substring(0, 8)}...</div>
                
                <div style="font-size:11px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:8px;">
                    Last seen: ${d.last_seen_at?.split('T')[1]?.split('.')[0] || 'Unknown'}
                </div>
            </div>
        `).join('');

        // Add hover effect via JS or CSS (already inline style for simplicity)

    } catch (e) {
        console.error("Grid Error:", e);
    }
}

window.openDetail = async (id, name) => {
    currentDevId = id;
    document.getElementById('teamView').classList.add('hidden');
    document.getElementById('detailView').classList.remove('hidden');

    document.getElementById('detailName').textContent = name;
    await loadUserDetail(id);
};

async function loadUserDetail(id) {
    try {
        const reports = await invoke('get_reports_by_developer', { devId: id, limit: 50 });
        const list = document.getElementById('detailReportsList');

        document.getElementById('detailToday').textContent = reports.length; // Approximate "Recent"

        if (!reports || reports.length === 0) {
            list.innerHTML = `<div class="empty-state">No recent activity</div>`;
            return;
        }

        list.innerHTML = reports.map(r => `
            <div class="report-item">
                <div class="report-header">
                    <span class="report-time">${r.created_at?.split('T')[1]?.split('.')[0]}</span>
                    <span class="activity-badge coding">${r.activity_type}</span>
                </div>
                <div class="report-desc">${r.description}</div>
            </div>
        `).join('');

    } catch (e) {
        console.error("Detail Error:", e);
    }
}

async function refreshData() {
    // Deprecated in favor of loadTeamGrid
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
