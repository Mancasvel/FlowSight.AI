# FlowSight AI

**Real-time privacy-first developer activity monitoring powered by local AI.**

FlowSight AI provides deep insights into developer activity without compromising privacy. It uses a **Hybrid Context Extraction** system to analyze screen content, system state, and project context locally, transmitting only secure fingerprints and metadata to a central dashboard.

## 🚀 Features

*   **Privacy First**: No images leave the developer's machine. Only text descriptions and metadata are transmitted.
*   **Hybrid Context Engine**:
    *   **Generative Vision**: Uses **Qwen 2 VL** to generate detailed human-readable descriptions of screen activity (e.g., "Editing a Rust struct").
    *   **Contextual Intelligence**: Uses **Qwen 2.5 (1.5B)** on the PM Dashboard to aggregate and summarize team activity every 5 minutes.
    *   **System Context**: Exact Window Titles, App Names, and Git Branch correlation.
*   **PM Dashboard 2.0**:
    *   **Master-Detail UI**: Real-time Team Grid and simplified individual Activity Feeds.
    *   **Local Persistence**: All data is stored in an encrypted local **SQLite** database.
    *   **Secure Auth**: Local bcrypt-hashed authentication with session persistence.
*   **Real-time Sync**: Uses **Supabase Realtime** (WebSockets) for sub-second state synchronization between Agent and PM.

## 🏗️ Technical Architecture

FlowSight AI is built as a distributed system of lightweight desktop agents communicating via a secure relay.

### Technology Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Core Framework** | **Tauri (Rust)** | High-performance, secure desktop application shell. |
| **Generative AI** | **Ollama** | Runs local Qwen models (Qwen 2 VL, Qwen 2.5) for text generation. |
| **Frontend** | **Vanilla JS / HTML5** | Lightweight, framework-free UI for maximum speed. |
| **Database** | **SQLite** | Local, serverless storage for the PM Dashboard. |
| **Networking** | **Supabase Realtime** | WebSocket-based Pub/Sub for secure signal transmission. |

### Data Flow Diagram

1.  **Capture**: Agent captures the screen (in-memory) every 30s.
2.  **Contextualize**:
    *   Rust backend queries OS for Window Title/App Name.
    *   **Ollama (Qwen 2 VL)** analyzes the screenshot to generate a text summary.
    *   **Zero Retention**: Screenshot is immediately discarded after analysis.
3.  **Broadcast**: Agent bundles `(summary, metadata, device_id)` and pushes to Supabase Channel `room1`.
4.  **Receive**: PM Dashboard subscribes to `room1`.
5.  **Persist**: PM receives payload, saves to `apps/pm/pm-dashboard.db` (SQLite).
6.  **Summarize**: A background job runs every 5 mins, using **Qwen 2.5** to generate high-level context summaries.

```mermaid
graph TD
    subgraph Developer Machine [Agent]
        Screen[Screen Buffer] -->|Image| Ollama[Ollama (Qwen 2 VL)]
        OS[OS APIs] -->|Window/App| Rust[Rust Backend]
        Ollama -->|Text Description| Rust
        Rust -->|JSON Payload| Supabase[Supabase Realtime]
    end

    subgraph Manager Machine [PM Dashboard]
        Supabase -->|WebSocket Event| PM_Rust[Tauri Backend]
        PM_Rust -->|Insert| DB[(SQLite DB)]
        DB -->|Query| Summarizer[Background Job (Qwen 2.5)]
        Summarizer -->|Context Summary| DB
        DB -->|Query| UI[Dashboard UI]
    end
```

## 🛠️ Prerequisites

*   **Rust 1.77+**: For compiling the Tauri backend.
*   **Node.js 18+ (pnpm)**: For frontend asset bundling and package management.
*   **Ollama**: Installed and running.
    *   **Models Required**: `qwen2-vl:2b` (Agent), `qwen2.5:1.5b` (PM).

## 🏁 Quick Start

### 1. Setup

Install functionality:
```bash
pnpm install
```

### 2. Configure Environment
Create a `.env` file in the project root:
```ini
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLIC_KEY="your-publishable-key"
```

### 3. Start PM Dashboard (Manager)

```bash
pnpm dev:pm
```
*   **Login**: Create a local account.
*   **Mock Data**: Use "Generate Mock Data" on the login screen to verify UI instantly.
*   **Database Location**: `~/.local/share/FlowSight/pm-dashboard.db` (Linux/Mac) or `%AppData%\Local\FlowSight\pm-dashboard.db` (Windows).

### 4. Start DEV Agent (Developer)

```bash
pnpm dev:agent
```
The agent starts silently. Ensure **Ollama** is running for full functionality.

## ⚙️ Configuration

### Agent (`dev-agent.db`)
*   `capture_interval`: Frequency of snapshots (Default: 30s).
*   `vision_model`: AI Model selection (Default: `qwen2-vl:2b`).

### PM (`pm-dashboard.db`)
*   `retention_days`: Auto-delete logs older than X days (Default: 7).
*   `server_port`: Internal API port (Default: 8080).

## 🔌 API Reference (Internal)

The PM Dashboard allows internal Tauri commands for extensions:

*   `login_user(username, password)`: Returns a session token.
*   `verify_session(token)`: Validates active session.
*   `get_developers()`: Returns `Vec<Developer>` with realtime online status.
*   `get_reports_by_developer(id, limit)`: Returns detailed activity logs.

## 🏗️ Building for Production

To create optimized standalone executables (`.exe`, `.dmg`, `.deb`):

```bash
# Build entire suite
pnpm build

# Build specific app
pnpm build:pm      # Output: apps/pm/src-tauri/target/release
pnpm build:agent   # Output: apps/agent/src-tauri/target/release
```

## 📄 License

MIT
