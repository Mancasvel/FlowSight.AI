
import { invoke } from '@tauri-apps/api/core';
import { createClient } from '@supabase/supabase-js';

console.log("Main.js starting...");

// Global Error Handler
window.onerror = function (msg, url, line) {
    alert("App Error: " + msg + "\n" + url + ":" + line);
    return false;
};

// Safe Invoke Helper
async function safeInvoke(cmd, args = {}) {
    try {
        return await invoke(cmd, args);
    } catch (e) {
        console.error(`Command ${cmd} failed:`, e);
        return null;
    }
}

// Initialize backend
(async () => {
    try {
        console.log("Initializing PM Backend...");
        await invoke('initialize_pm');
        console.log("PM Backend Initialized.");
    } catch (err) {
        console.error("Backend Init Failed:", err);
    }
})();

// Helper to manually find the button since it might be dynamic? 
// No, it's static in index.html, but let's be safe.
function setupActivation() {
    const btn = document.getElementById('activateBtn');
    if (!btn) {
        console.error("Activate Button Not Found yet - Validating Loop");
        setTimeout(setupActivation, 500);
        return;
    }

    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    console.log("Attached listener to Activate Button");

    newBtn.addEventListener('click', async () => {
        // Feedback immediately
        newBtn.textContent = 'Checking...';

        const keyInput = document.getElementById('licenseInput');
        const key = keyInput.value.trim();
        const errorMsg = document.getElementById('loginError');

        errorMsg.style.display = 'none';

        if (!key) {
            alert("Please enter a license key");
            newBtn.textContent = 'Activate Dashboard';
            return;
        }

        try {
            // RUST CALL
            const isValid = await invoke('validate_license_key', { key });

            if (isValid) {
                alert("License Valid! Saving...");
                localStorage.setItem('saas_license_key', key);
                document.getElementById('loginOverlay').classList.add('hidden');
                loadConfig();
            } else {
                alert("Invalid License Key (checked via Rust)");
                errorMsg.textContent = 'Invalid or inactive license key.';
                errorMsg.style.display = 'block';
            }
        } catch (e) {
            alert("Rust Error: " + e);
        }

        newBtn.textContent = 'Activate Dashboard';
    });
}

// Ensure DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupActivation);
} else {
    setupActivation();
}

// ============ CONFIG & SETUP ============

async function loadConfig() {
    const config = await safeInvoke('get_config');
    if (config) {
        document.getElementById('teamName').value = config.team_name || '';
        document.getElementById('serverPort').value = config.server_port || 8080;
        document.getElementById('apiKeyDisplay').textContent = config.api_key || '-';
    }
}

async function updateStats() {
    try {
        const stats = await safeInvoke('get_stats');
        if (stats) {
            document.getElementById('statDevs').textContent = stats.total_developers || 0;
            document.getElementById('statOnline').textContent = stats.online_developers || 0;
            document.getElementById('statReports').textContent = stats.total_reports || 0;
            document.getElementById('statToday').textContent = stats.reports_today || 0;
        }
    } catch (e) {
        console.error('Stats error:', e);
    }
}

async function loadDevelopers() {
    try {
        const devs = await safeInvoke('get_developers');
        if (!devs) return;

        const list = document.getElementById('developersList');

        if (devs.length === 0) {
            list.innerHTML = `<div class="empty-state">
        <span class="material-icons">person_add</span>
        <div>No developers connected yet</div>
      </div>`;
            return;
        }

        list.innerHTML = devs.map(dev => `
      <div class="developer-item">
        <div class="dev-info">
          <div class="dev-status ${dev.is_online ? 'online' : ''}"></div>
          <div>
            <div class="dev-name">${dev.name}</div>
            <div class="dev-id">${dev.id}</div>
          </div>
        </div>
        <div class="dev-id">${dev.last_seen_at || 'Never'}</div>
      </div>
    `).join('');
    } catch (e) {
        console.error('Developers error:', e);
    }
}

async function loadReports() {
    try {
        const reports = await safeInvoke('get_reports', { limit: 50 });
        if (!reports) return;

        const list = document.getElementById('reportsList');

        if (reports.length === 0) {
            list.innerHTML = `<div class="empty-state">
        <span class="material-icons">inbox</span>
        <div>No activity reports yet</div>
      </div>`;
            return;
        }

        list.innerHTML = reports.map(r => `
      <div class="report-item">
        <div class="report-header">
          <span class="report-dev">${r.developer_name}</span>
          <span class="report-time">${r.created_at}</span>
        </div>
        <div class="report-desc">${r.description}</div>
        <span class="activity-badge ${r.activity_type}">${r.activity_type}</span>
      </div>
    `).join('');
    } catch (e) {
        console.error('Reports error:', e);
    }
}

async function updateServerStatus() {
    try {
        const status = await safeInvoke('get_server_status');
        if (!status) return;

        const dot = document.getElementById('serverDot');
        const text = document.getElementById('serverStatusText');
        const startBtn = document.getElementById('startServerBtn');
        const stopBtn = document.getElementById('stopServerBtn');

        if (status.running) {
            dot.classList.add('running');
            text.textContent = `Running on port ${status.port}`;
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = 'inline-flex';
        } else {
            dot.classList.remove('running');
            text.textContent = 'Server stopped';
            if (startBtn) startBtn.style.display = 'inline-flex';
            if (stopBtn) stopBtn.style.display = 'none';
        }
    } catch (e) {
        console.error('Server status error:', e);
    }
}

async function saveConfig() {
    const config = {
        team_name: document.getElementById('teamName').value,
        server_port: parseInt(document.getElementById('serverPort').value) || 8080,
        retention_days: 7,
    };
    await invoke('update_config', { config });
}

// Event listeners
const startServerBtn = document.getElementById('startServerBtn');
if (startServerBtn) {
    startServerBtn.onclick = async () => {
        try {
            await saveConfig();
            const result = await invoke('start_server');
            console.log('Start server result:', result);
            updateServerStatus();
        } catch (e) {
            console.error('Failed to start server:', e);
            alert('Failed to start server: ' + e);
        }
    };
}

const stopServerBtn = document.getElementById('stopServerBtn');
if (stopServerBtn) {
    stopServerBtn.onclick = async () => {
        await invoke('stop_server');
        updateServerStatus();
    };
}

const newKeyBtn = document.getElementById('newKeyBtn');
if (newKeyBtn) {
    newKeyBtn.onclick = async () => {
        if (confirm('Generate new API key? Old key will stop working.')) {
            const newKey = await invoke('generate_api_key');
            document.getElementById('apiKeyDisplay').textContent = newKey;
        }
    };
}

// Auto Refresh
setInterval(() => {
    refreshData();
}, 5000);

// Expose for debugging/global access
window.refreshData = async () => {
    await loadDevelopers();
    await loadReports();
    await updateStats();
};

const refreshBtn = document.getElementById('refreshBtn');
if (refreshBtn) {
    refreshBtn.onclick = () => {
        refreshData();
    };
}

const teamNameInput = document.getElementById('teamName');
if (teamNameInput) teamNameInput.onchange = saveConfig;

const serverPortInput = document.getElementById('serverPort');
if (serverPortInput) serverPortInput.onchange = saveConfig;

function checkLicense() {
    // Only check localStorage initially
    const stored = localStorage.getItem('saas_license_key');
    if (stored) {
        document.getElementById('loginOverlay').classList.add('hidden');
    }
}

// Initial load
checkLicense();
loadConfig();
updateServerStatus();
updateStats();
refreshData();
