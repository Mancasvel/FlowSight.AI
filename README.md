# FlowSight AI

**Privacy-oriented developer productivity agent**

FlowSight AI is a desktop application that helps you reflect on and document your development work. **Processing runs on your machine**—sensitive activity data is not sent to our servers for analysis.

## Features

- **Local processing** — analysis and storage stay on the device you control.
- **Desktop app** — built with Tauri (Rust) and a web-based UI.
- **Activity-oriented workflow** — surface what you were working on in one place.

## Prerequisites

- **Rust** (stable) — for the Tauri backend
- **Node.js** (18+) and **pnpm** (8+) — for the frontend toolchain

Some features may depend on additional local tools; the app indicates what is missing when relevant.

## Quick start

```bash
pnpm install
pnpm dev
```

The dev script starts the FlowSight agent app.

## Building for production

```bash
pnpm build
```

Release bundles are produced under `apps/agent/src-tauri/target/release/bundle/` (format varies by OS: installer, AppImage, `.deb`, etc.).

GitHub Actions can build installers when you publish a **Release** (see `.github/workflows/release.yml`).

## Configuration

App settings and local data are stored on your machine only. Exact locations and options are managed by the application; they are not documented here.

## License and use

This project is **private, proprietary software**. All rights reserved.

You may **not** copy, redistribute, publish, sell, or otherwise replicate this code or derived works without **explicit written permission** from the owners. Unauthorized use or reproduction is not permitted.
