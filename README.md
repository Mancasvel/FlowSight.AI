# FlowSight AI

**Real-time privacy-first developer activity monitoring powered by local AI.**

FlowSight AI provides deep insights into developer activity without compromising privacy. It uses a **Hybrid Context Extraction** system to analyze screen content, system state, and project context locally, transmitting only secure fingerprints and metadata to a central dashboard.

## 🚀 Features

*   **Privacy First**: No images leave the developer's machine. Only vector embeddings (512-dim) and text metadata are transmitted.
*   **Hybrid Context Engine**:
    *   **Generative Vision**: Uses **Ollama (LLaVA/Moondream)** to generate human-readable descriptions of screen activity (e.g., "Editing a Rust struct").
    *   **Semantic Search**: Uses **OpenAI CLIP** to generate vector embeddings for enabling "Find similar moments" features.
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
| **Generative AI** | **Ollama** | Runs local VLMs (LLaVA, Moondream) for image-to-text description. |
| **Semantic AI** | **Python 3 / CLIP** | Semantic image analysis and embedding generation. |
| **Frontend** | **Vanilla JS / HTML5** | Lightweight, framework-free UI for maximum speed. |
| **Database** | **SQLite** | Local, serverless storage for the PM Dashboard. |
| **Networking** | **Supabase Realtime** | WebSocket-based Pub/Sub for secure signal transmission. |

### Data Flow Diagram

1.  **Capture**: Agent captures the screen (in-memory) every 10s.
2.  **Contextualize**:
    *   Rust backend queries OS for Window Title/App Name.
    *   Rust checks CWD for Git Branch.
    *   **Ollama** analyzes the screenshot to generate a text summary (e.g. "Debugging code").
    *   **CLIP** generates a vector representation.
3.  **Broadcast**: Agent bundles `(summary, vector, metadata, device_id)` and pushes to Supabase Channel `room1`.
4.  **Receive**: PM Dashboard subscribes to `room1`.
5.  **Persist**: PM receives payload, saves to `apps/pm/pm-dashboard.db` (SQLite).
6.  **Visualize**: PM Frontend queries the local DB to render the Team Grid and Activity Feed.

```mermaid
graph TD
    subgraph Developer Machine [Agent]
        Screen[Screen Buffer] -->|Image| Ollama[Ollama (Local AI)]
        Screen -->|Image| CLIP[Python CLIP Process]
        OS[OS APIs] -->|Window/App| Rust[Rust Backend]
        Ollama -->|Text Description| Rust
        CLIP -->|Vector| Rust
        Rust -->|JSON Payload| Supabase[Supabase Realtime]
    end

    subgraph Manager Machine [PM Dashboard]
        Supabase -->|WebSocket Event| PM_Rust[Tauri Backend]
        PM_Rust -->|Insert| DB[(SQLite DB)]
        DB -->|Query| UI[Dashboard UI]
    end
```

## 🛠️ Prerequisites

*   **Rust 1.77+**: For compiling the Tauri backend.
*   **Node.js 18+ (pnpm)**: For frontend asset bundling and package management.
*   **Ollama**: Installed and running (for text generation).
*   **Python 3.10+**: Required for the CLIP embedding script (`apps/agent/python/requirements.txt`).
    *   Dependencies: `torch`, `transformers`, `Pillow`.

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
*   `capture_interval`: Frequency of snapshots (Default: 10s).
*   `vision_model`: AI Model selection (Default: `llava:7b` or `moondream`).

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
