# FlowSight

**Privacy-first developer productivity intelligence — runs locally on your machine.**



[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![Commercial License available](https://img.shields.io/badge/Commercial%20License-available-green.svg)](./COMMERCIAL-LICENSE.md)
[![CLA required](https://img.shields.io/badge/CLA-required-orange.svg)](./CLA.md)
[![Buy me a coffee on Ko-fi](https://img.shields.io/badge/Buy%20me%20a%20coffee-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/mancasvel)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Mancasvel/FlowSight.AI)

FlowSight is a desktop application that helps distributed engineering
teams understand how their work flows, without the surveillance baggage of
traditional productivity tools. **All sensitive processing happens on the
developer's machine**: screen context, git metadata, and activity summaries
are analyzed by a bundled local LLM. Cloud sync is opt-in; connecting an
external AI through MCP can also send the requested report data to that AI.

---

## Features

- **100% local inference** — bundled `llama.cpp` + quantized Qwen3-VL-2B-Instruct GGUF
  weights downloaded once and verified on the device. No cloud roundtrips for
  sensitive data; inference works offline after the model is present.
- **Desktop-native** — Tauri 2 (Rust) shell, Vite frontend, SQLite for local
  state. Installs as a single `.msi` on Windows.
- **Activity-oriented, not surveillance-oriented** — the agent surfaces
  meaningful work units (branches, PRs, focus windows) rather than keystroke
  counts.
- **Opt-in local focus reminders** — on Windows, Qwen can propose a reminder
  through an internal tool using only aggregate signals. FlowSight checks
  tracking state, consent, observed evidence and cooldown before showing it.
  Reminders use generic text by default. A separate Profile setting can add a
  verified public app or site label and the selected task to the local system
  notification; names are never sent to Qwen for the reminder decision.
  External MCP clients cannot call this tool.
- **Team analytics, with consent** — opt-in aggregation into a Supabase
  backend only for users who join a team.
- **Self-hostable backend** — the Community Edition can run against your own
  Supabase instance.

## Bring your own AI (MCP)

The installed app includes a read-only [FlowSight MCP server](docs/MCP.md).
Open Settings > Connect your AI for the exact command to use in a compatible
desktop AI client. No extra runtime is required, and activity descriptions
and ticket IDs are excluded by default.

## Status

FlowSight is in **active development**. Expect breaking changes until
v1.0. Track progress on the [Releases](../../releases) page.

---

## Quick start

### Prerequisites

- **Windows 10/11** (Linux and macOS are on the roadmap).
- **Rust** stable (for building the Tauri shell).
- **Node.js** 18+ and **pnpm** 8+.
- **Python** 3.11+ (optional: run local review-queue tests and future model evaluation tools).

### Install and run

```bash
git clone https://github.com/Mancasvel/FlowSight.AI.git
cd FlowSight.AI
pnpm install
pnpm dev
```

The dev command starts the agent with hot reload. The first run downloads
the GGUF model from the repository's GitHub Release (see `scripts/fetch-models.mjs`).

### Build a release installer

```bash
pnpm build
```

The installer lands in `apps/agent/src-tauri/target/release/bundle/`. It
bundles `llama-server.exe` and its DLLs. On first use, FlowSight downloads the
two GGUF weights into the user's app-data directory, verifies their SHA-256,
and then runs without network access. Keeping the weights out of NSIS also
makes later app updates much smaller.

The checkpoint is Qwen3-VL-2B-Instruct (Apache-2.0), using the Qwen team's official Q4_K_M GGUF;
see [model provenance and hashes](./local_llm/MODEL_NOTICE.md). It is not yet
fine-tuned on FlowSight usage. The [local review workflow](./docs/LOCAL_FINETUNE_READINESS.md)
prepares optional, human-checked labels for a future model iteration.

---

## Architecture (short version)

```
+-------------------------------+       +-----------------------+
|  Tauri agent (Rust)           |       |  Supabase backend     |
|   - OAuth (Google)            |<----->|   - Teams             |
|   - Context capture           |       |   - Aggregated events |
|   - Local LLM (llama.cpp)     |       |   - RLS per team      |
|   - SQLite state              |       +-----------------------+
+---------------+---------------+
                |
                v
     %LOCALAPPDATA%\FlowSight\
     (logs, db, cache — local only)
```

The heavy lifting (context summarization, PII filtering, intent inference)
runs in-process against the local `llama-server.exe`. Only already-filtered
aggregates reach the cloud backend, and only when the user belongs to a
team.

## Repository layout

```
apps/
  agent/          Tauri desktop app (Rust + Vite frontend)
  dashboard/      Next.js team dashboard (optional)
local_llm/
  bin/            llama-server.exe + DLLs (committed, ~50 MB)
  *.gguf          Local model weights (fetched at build time, not committed)
scripts/
  fetch-models.mjs  Prebuild hook (Node-only): downloads GGUF from GitHub Releases
.github/
  workflows/      CI (build, release, gitleaks)
```

## Configuration

All user-facing settings live in the desktop app. Local state is persisted
under:

- **Windows:** `%LOCALAPPDATA%\FlowSight\`
- Logs: `server.log`, `agent_error.log`, `crash.log`
- Database: `dev-agent.db` (SQLite)

No configuration file is expected on the user's side. The environment
variable `GITHUB_TOKEN` is only needed by developers who want to fetch
model assets from a private release.

---

## Join Us

**We're hiring our first engineer.**

FlowSight is a privacy-first productivity tool that runs locally on your machine. No surveillance, no cloud dependency, no compromise. Backed by Microsoft for Startups, incubated at Xiji (Shanghai), part of AltaLab's accelerator.

### The problem we're solving
- Teams waste hours in meetings that could be a message
- "Productivity tools" are surveillance with a nicer UI
- No one trusts their data with the tools they use at work
- Privacy and good UX shouldn't be mutually exclusive

### Who we're looking for
- You've shipped something end-to-end (side project, startup, open source)
- You're comfortable with Rust, TypeScript, or systems-level work
- You understand why privacy-first architecture matters
- You want to build, not just code tickets

### Why FlowSight
- Equity-first role. Real ownership, not token options
- Product is live. Not a pitch deck, a working app
- Technical CEO who built it solo and needs a multiplier
- Shanghai-based or remote. We care what you build

### How to apply

Send an email to **manuel@flowsight.site** with:
- Something you've built that you're proud of
- Why privacy-first AI matters to you
- Your GitHub or portfolio

No cover letters. No culture fit essays. Show us what you've done.

---

## License and distribution

FlowSight is distributed under a **dual licensing model**:

| Edition | License | Intended for |
|---|---|---|
| **Community** | [GNU AGPL-3.0](./LICENSE) | Anyone, including commercial users, who follows the AGPL |
| **Enterprise / Commercial** | [Proprietary, per contract](./COMMERCIAL-LICENSE.md) | Different license terms for closed-source distribution, SaaS, OEM, or policies that forbid AGPL |

> **TL;DR:** commercial use is allowed under the AGPL. You can use, modify,
> redistribute, and self-host the Community Edition while following its terms,
> including applicable source-sharing obligations for distributed or modified
> network-served versions. If you need different terms, ask about a separate
> proprietary license: **manuel@flowsight.site**. A planned €10 one-time
> Individual purchase is for the official local distribution, not a proprietary
> source-code license; monthly cloud plans are separate.

### Contributing

Contributions are very welcome. **Every contributor must sign a CLA**
(individuals: [`CLA.md`](./CLA.md), companies: [`CLA-CORPORATE.md`](./CLA-CORPORATE.md))
so that the project can keep the dual-licensing model working. The
[`CLA Assistant`](https://cla-assistant.io/) bot handles signatures
automatically on your first PR. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the full flow.

### Code of Conduct

Participation is governed by the [Contributor Covenant](./CODE_OF_CONDUCT.md).

### Security

If you find a vulnerability, **please do not open a public issue**. Use
GitHub's private Security Advisory feature on this repository, or email
**manuel@flowsight.site**.

---

## Support FlowSight

FlowSight's source code is open source under the AGPL. If it's useful to you, consider supporting the project:

### 💜 [Buy me a coffee on Ko-fi](https://ko-fi.com/mancasvel)

Every coffee helps keep development going. All funds go directly to:

- **Server costs** — CI/CD, model hosting, Supabase backend
- **Model improvements** — better local LLMs for activity analysis
- **Cross-platform** — Linux and macOS builds
- **New features** — team analytics, integrations, plugin system

### Sponsor Tiers

| Tier | Amount | Badge |
|------|--------|-------|
| ☕ Supporter | €1-4 | Listed in [SPONSORS.md](./SPONSORS.md) |
| ☕☕ Champion | €5-14 | Listed + name in app credits |
| 💎 Founding Supporter | €15+ | Listed + featured in app About page |
| 🔄 Monthly Backer | Any recurring | All above + early access to features |

### Other ways to contribute

- ⭐ **Star this repo** — helps with visibility
- 🐛 **Report bugs** — open an issue
- 💻 **Submit a PR** — see [CONTRIBUTING.md](./CONTRIBUTING.md)
- 📣 **Spread the word** — share with your team

---

## Trademarks

"FlowSight" is a trademark of FlowSight. The AGPL license grants you
rights to the code but **not** to the trademark. If you
publish a fork, please pick a different name for your distribution.

---

## Links

- **Product website:** *coming soon*
- **Commercial inquiries:** manuel@flowsight.site
- **Security reports:** manuel@flowsight.site
- **Legal (CLA questions):** manuel@flowsight.site
