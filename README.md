# FlowSight AI (Standalone)
**Privacy-# FlowSight AI (Standalone)

**Privacy-First, Local-Only Developer Activity Monitor**

FlowSight AI is a lightweight desktop agent that uses local AI to transparently document your development work. It captures screenshots every 30 seconds, uses a local Vision Language Model (Qwen 3 VL) to describe the activity, and logs it to a local database.

**Zero Data Exfiltration.** All data stays on your machine.

## 🚀 Features

*   **Privacy First**: No data leaves your machine.
*   **Local AI**: Uses **Ollama** + **Qwen 3 VL** (`qwen3-vl:2b`) for accurate screen understanding.
*   **Activity Feed**: Live feed of what the AI detected you doing.
*   **Lightweight**: Built with Tauri (Rust) and Vanilla JS.

## 🛠️ Prerequisites

*   **Ollama**: Installed and running.
    *   **Model**: `qwen3-vl:2b`.
*   **Rust**: For building the backend.
*   **Node.js (pnpm)**: For frontend assets.

## 🏁 Quick Start

### 1. Setup

```bash
pnpm install
```

### 2. Start Agent

```bash
pnpm dev
```

(The `dev` script now points directly to the Agent).

### 3. Usage

1.  Open the App.
2.  Ensure "Ollama Ready" status is green.
3.  Click **Start**.
4.  FlowSight will capture context every 30s and log it to the feed.

## ⚙️ Configuration

Stored in `~/.local/share/FlowSight/dev-agent.db` (Linux/Mac) or `%AppData%\FlowSight\dev-agent.db` (Windows).

*   `capture_interval`: Default 30s.
*   `vision_model`: Default `qwen3-vl:2b`.

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
