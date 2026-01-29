# FlowSight AI

**Real-time developer activity monitoring with local AI analysis.**

Two lightweight desktop apps built with Tauri (Rust + HTML):

| App | Description | Size |
|-----|-------------|------|
| **DEV Agent** | Captures screen, analyzes with LLaVA, sends reports | ~15MB |
| **PM Dashboard** | Receives reports, shows team activity in real-time | ~15MB |

## Architecture

```
┌─────────────────────┐     HTTP      ┌─────────────────────┐
│     DEV Agent       │──────────────>│   PM Dashboard      │
│                     │               │                     │
│  - Screen capture   │   Text only   │  - HTTP Server      │
│  - LLaVA analysis   │   (no images) │  - SQLite storage   │
│  - SQLite buffer    │               │  - Real-time view   │
│                     │               │                     │
│     Ollama          │               │     API Key auth    │
└─────────────────────┘               └─────────────────────┘
```

**Privacy**: Screenshots never leave the dev's machine. Only text descriptions are sent.

## Requirements

- [Rust 1.77+](https://rustup.rs)
- [Ollama](https://ollama.ai)
- [Node.js 18+](https://nodejs.org)
- [pnpm](https://pnpm.io)

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run PM Dashboard

```bash
pnpm dev:pm
```

Start the server and copy the API key.

### 3. Run DEV Agent

```bash
pnpm dev:agent
```

Enter PM Dashboard URL and API key. Install Ollama + LLaVA when prompted.

## Build for Production

```bash
# Build both apps
pnpm build

# Or individually
pnpm build:agent
pnpm build:pm
```

Installers will be in `apps/*/src-tauri/target/release/bundle/`.

## Project Structure

```
FlowSight.AI/
├── apps/
│   ├── agent/          # DEV Agent (Tauri)
│   │   ├── src/
│   │   │   └── renderer/
│   │   │       └── index.html
│   │   └── src-tauri/
│   │       └── src/
│   │           ├── agent.rs
│   │           ├── lib.rs
│   │           └── main.rs
│   │
│   └── pm/             # PM Dashboard (Tauri)
│       ├── src/
│       │   └── index.html
│       └── src-tauri/
│           └── src/
│               ├── pm.rs
│               ├── lib.rs
│               └── main.rs
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## License

MIT
