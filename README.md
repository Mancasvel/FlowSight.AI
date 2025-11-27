# FlowSight AI

**Privacy-First, Local-First Developer Productivity Agent**

FlowSight AI is a revolutionary developer productivity tool that detects and resolves coding blockers in real-time. Unlike traditional cloud-based solutions, FlowSight processes everything locally on your machine, ensuring 100% privacy and sub-200ms response times.

## 🚀 Key Features

- **100% Local Processing** - Zero data leaves your machine
- **Sub-200ms Detection** - Instant blocker identification
- **GDPR/CCPA Compliant** - Privacy by architecture
- **Offline-First** - Works without internet
- **Cross-Platform** - macOS, Windows, Linux support
- **Hybrid AI** - Rules + ML + Vision intelligence

## 🏗️ Architecture

```
Developer Machine (Electron Agent)
├── ActivityMonitor.ts (local)
├── ScreenCapture.ts (local, instant discard)
├── FastVLM.ts (Apple MLX - vision on-device)
├── OCRLocal.ts (PaddleOCR - text extraction)
├── RulesEngine.ts (deterministic blocker patterns)
├── LLMLocal.ts (Phi-3 mini - contextual reasoning)
├── BlockerDetector.ts (hybrid: rules + ML consensus)
└── LocalDashboard.ts (React WebSocket)

┌─→ Optional Cloud Sync (async, user-consent only)
└─→ MongoDB Atlas (historical data, no real-time processing)
```

## 🛠️ Installation

### Prerequisites

- Node.js 20.10+
- Python 3.11+ (for OCR)
- Ollama (for local LLM)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourorg/flowsight-ai.git
cd flowsight-ai

# Install dependencies
make setup

# Start development
make dev
```

### Manual Setup

```bash
# Install Node dependencies
pnpm install

# Install Python OCR dependencies
pip3 install paddlepaddle paddleocr

# Download AI models
npm run download:models phi3-mini llava-phi

# Start Ollama (for LLM)
ollama serve
ollama pull phi3:3.8b
```

## 🚀 Usage

```bash
# Development mode
make dev

# Build for production
make build

# Run tests
make test

# Create installer
make release
```

## 📊 Dashboard

Once running, FlowSight provides a local web dashboard at `http://localhost:3000` with:

- Real-time blocker detection
- Activity timeline
- Privacy controls
- Performance metrics
- Resolution tracking

## 🔒 Privacy

FlowSight is designed with privacy first:

- **No screenshots stored** - Images are processed instantly and discarded
- **No keystroke logging** - Only window focus and idle detection
- **No cloud required** - Fully functional offline
- **User consent required** - Optional cloud sync with explicit permission
- **Local data only** - All processing on-device

## 🤖 AI Models

FlowSight uses several local AI models:

- **Phi-3 Mini (3.8B)** - Contextual reasoning via Ollama
- **PaddleOCR** - Text extraction from screenshots
- **LLaVA-Phi** - Visual error detection
- **Rules Engine** - Deterministic pattern matching

## 🧪 Testing

```bash
# Run all tests
make test

# Run specific test suite
pnpm test -- tests/unit/RulesEngine.test.ts

# Type checking
make type-check

# Linting
make lint
```

## 📦 Build & Release

```bash
# Build all packages
make build

# Create platform-specific installers
make release

# Docker build
make docker
```

## 🏢 Business Model

- **Free Tier**: Local processing only, 30-day data retention
- **Pro ($5/dev/month)**: Cloud sync, 90-day retention, team features
- **Enterprise ($8/dev/month)**: Unlimited retention, SSO, dedicated support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

- Documentation: [docs.flowsight.ai](https://docs.flowsight.ai)
- Issues: [GitHub Issues](https://github.com/yourorg/flowsight-ai/issues)
- Email: support@flowsight.ai

---

**FlowSight AI** - Making developers more productive, one blocker at a time. 🔍✨