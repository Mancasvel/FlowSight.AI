# FlowSight AI

**Real-time developer activity monitoring with local AI analysis.**

Two lightweight desktop apps built with Tauri (Rust + HTML):
- **DEV Agent**: Captures screen, analyzes with LLaVA, sends reports to PM
- **PM Dashboard**: Receives reports, shows team activity in real-time

## Architecture

```
┌─────────────────────┐     HTTP      ┌─────────────────────┐
│     DEV Agent       │──────────────>│   PM Dashboard      │
│                     │               │                     │
│  - Screen capture   │               │  - HTTP Server      │
│  - LLaVA analysis   │               │  - SQLite storage   │
│  - SQLite buffer    │               │  - Real-time view   │
│                     │               │                     │
│  Ollama (local)     │               │  API Key auth       │
└─────────────────────┘               └─────────────────────┘
```

## Requirements

- **Rust 1.77+** - [Install Rust](https://rustup.rs)
- **Ollama** - [Install Ollama](https://ollama.ai)
- **LLaVA model** - `ollama pull llava:7b`
- **Node.js 18+** (for Tauri CLI)

## Quick Start

### 1. Install Ollama and LLaVA

```bash
# Install Ollama from https://ollama.ai
ollama serve
ollama pull llava:7b
```

### 2. Run PM Dashboard

```bash
cd apps/pm
pnpm install
pnpm dev
```

The PM Dashboard will start and show its API key. Share this key with developers.

### 3. Run DEV Agent

```bash
cd apps/agent
pnpm install
pnpm dev
```

Enter the PM Dashboard URL (e.g., `http://192.168.1.100:8080`) and API key.

## How It Works

1. **DEV Agent** captures the screen every N seconds
2. **LLaVA** (running locally via Ollama) analyzes the screenshot
3. LLaVA generates a text description of what the developer is doing
4. The text report is sent to the **PM Dashboard** via HTTP
5. **PM Dashboard** stores reports in SQLite and displays them

**Privacy**: Screenshots never leave the developer's machine. Only text descriptions are sent.

## Apps

| App | Description | Tech |
|-----|-------------|------|
| `apps/agent` | DEV Agent - screen capture + AI | Tauri + Rust |
| `apps/pm` | PM Dashboard - team monitor | Tauri + Rust |

## Build for Production

```bash
# Build DEV Agent
cd apps/agent
pnpm build

# Build PM Dashboard  
cd apps/pm
pnpm build
```

Installers will be in `src-tauri/target/release/bundle/`.

## License

MIT
