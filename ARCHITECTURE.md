# FlowSight AI - Architecture Overview

## Executive Summary

FlowSight AI is a privacy-first, locally-executed AI system that detects and resolves developer blockers in real-time. This document outlines the complete architectural design for converting the existing cloud-based repository into a distributed, edge-first architecture.

## Core Principles

### 1. Privacy by Design
- **Zero data transmission**: All processing occurs locally
- **No persistent storage of sensitive data**: Screenshots processed instantly and discarded
- **User consent required**: Cloud sync is opt-in only
- **GDPR/CCPA compliant**: Architecture ensures compliance

### 2. Local-First Architecture
- **Offline-first**: Core functionality works without internet
- **Sub-200ms latency**: No network round-trips for blocker detection
- **Unlimited scalability**: Each device operates independently
- **Resilient**: Continues working during network outages

### 3. Hybrid AI Intelligence
- **Deterministic rules**: Fast, reliable pattern matching
- **Local ML models**: On-device inference for context
- **Computer vision**: Screenshot analysis for visual cues
- **Consensus-based decisions**: Multiple signals for high confidence

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Machine                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                Electron Main Process               │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            ActivityMonitor                     │ │    │
│  │  │  - OS-level window tracking                     │ │    │
│  │  │  - Idle detection                              │ │    │
│  │  │  - Process monitoring                           │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            ScreenCapture                        │ │    │
│  │  │  - Safe local screenshots                        │ │    │
│  │  │  - Instant discard after processing             │ │    │
│  │  │  - Metadata-only retention                       │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            BlockerDetector                      │ │    │
│  │  │  - Hybrid intelligence engine                   │ │    │
│  │  │  - Consensus-based detection                    │ │    │
│  │  │  - Real-time blocker identification             │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            DashboardServer                      │ │    │
│  │  │  - Express + Socket.io                          │ │    │
│  │  │  - Real-time WebSocket sync                     │ │    │
│  │  │  - Local web interface                          │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │               AI/ML Components                     │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            RulesEngine                         │ │    │
│  │  │  - Deterministic blocker patterns              │ │    │
│  │  │  - Fast regex-based detection                   │ │    │
│  │  │  - Configurable rule sets                       │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            LLMLocal                             │ │    │
│  │  │  - Phi-3 mini via Ollama                        │ │    │
│  │  │  - Contextual reasoning                         │ │    │
│  │  │  - Offline inference                            │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            OCRLocal                             │ │    │
│  │  │  - PaddleOCR text extraction                    │ │    │
│  │  │  - Local processing only                        │ │    │
│  │  │  - Confidence scoring                           │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            VisionLocal                          │ │    │
│  │  │  - FastVLM/LLaVA for vision                     │ │    │
│  │  │  - Error pattern recognition                    │ │    │
│  │  │  - Local model inference                        │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │               Data Layer                           │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            EventStore                          │ │    │
│  │  │  - SQLite local database                       │ │    │
│  │  - Event persistence and querying                 │ │    │
│  │  - Session management                             │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  │                                                       │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            PrivacyManager                       │ │    │
│  │  │  - User consent management                      │ │    │
│  │  │  - Privacy control enforcement                  │ │    │
│  │  │  - Configuration persistence                    │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │               Sync Layer (Optional)                │    │
│  │  ┌─────────────────────────────────────────────────┐ │    │
│  │  │            CloudSync                           │ │    │
│  │  │  - User-consent only                           │ │    │
│  │  │  - Aggregated data only                        │ │    │
│  │  │  - Async background sync                       │ │    │
│  │  └─────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### ActivityMonitor

**Purpose**: Track developer activity at the OS level without privacy violations.

**Key Features**:
- Platform-specific implementations (macOS: osascript, Windows: native API, Linux: xdotool)
- Window focus change detection
- Idle time calculation
- Process name extraction (for application identification)

**Privacy**: Only tracks window names and focus duration, no content or keystrokes.

### ScreenCapture

**Purpose**: Safely capture screen content for analysis while maintaining privacy.

**Key Features**:
- Electron desktopCapturer API usage
- Instant processing and discard of image data
- Metadata-only retention (width, height, colors)
- Configurable capture intervals

**Privacy**: Images exist in memory for <1 second, never written to disk.

### BlockerDetector

**Purpose**: Main intelligence engine that combines multiple AI techniques.

**Detection Pipeline**:
1. **Activity Analysis**: Check for prolonged activity indicating potential blocks
2. **Screenshot Capture**: Safe local capture (when enabled)
3. **OCR Processing**: Extract text from screen
4. **Rules Engine**: Fast deterministic pattern matching
5. **Vision Analysis**: ML-based visual error detection
6. **LLM Analysis**: Contextual reasoning for complex cases
7. **Consensus Scoring**: Weighted combination of all signals

**Blocker Types**:
- Build errors (compilation failures)
- Timeouts (hung processes)
- Circular dependencies
- Permission errors
- Resource exhaustion
- Network issues

### AI/ML Components

#### RulesEngine
- **Input**: OCR text, activity duration, window context
- **Processing**: Regex pattern matching with confidence scoring
- **Output**: Deterministic blocker classification
- **Performance**: <1ms per detection

#### LLMLocal
- **Model**: Phi-3 mini (3.8B parameters)
- **Runtime**: Ollama local inference
- **Input**: OCR text + context
- **Output**: Contextual blocker analysis and suggestions
- **Performance**: <500ms per inference

#### OCRLocal
- **Engine**: PaddleOCR
- **Input**: Screenshot buffer
- **Output**: Extracted text + confidence scores
- **Languages**: Multi-language support
- **Performance**: <200ms per image

#### VisionLocal
- **Models**: FastVLM (macOS) / LLaVA-Phi (Win/Linux)
- **Input**: Screenshot analysis
- **Output**: Visual error indicators (loading spinners, error colors, stack traces)
- **Performance**: <1000ms per analysis

### DashboardServer

**Purpose**: Provide real-time web interface for blocker monitoring.

**Features**:
- Express.js REST API
- Socket.io real-time updates
- Local web dashboard (localhost:3000)
- Blocker resolution interface
- Privacy controls
- Activity visualization

**Security**: Local-only access, no external exposure.

### Data Layer

#### EventStore
- **Database**: SQLite with better-sqlite3
- **Schema**: Events, sessions, metadata
- **Retention**: Configurable cleanup (default: 30 days)
- **Queries**: Time-based, type-based filtering

#### PrivacyManager
- **Configuration**: User privacy preferences
- **Enforcement**: Runtime privacy control
- **Persistence**: Local JSON config file
- **Defaults**: Maximum privacy (cloud sync disabled)

### CloudSync (Optional)

**Purpose**: User-opt-in cloud synchronization for team features.

**Features**:
- API key based authentication
- Aggregated data only (no raw screenshots/text)
- Background async sync
- User consent required
- GDPR-compliant data handling

**Data Types**:
- Blocker metadata (type, severity, confidence, timestamp)
- Session statistics
- Team analytics (when enabled)

## Data Flow

### Blocker Detection Flow

```
Activity Change
    ↓
ActivityMonitor → EventStore
    ↓
BlockerDetector.detect()
    ↓
├── Privacy Check (screenshots enabled?)
├── ScreenCapture.captureAndAnalyze()
│   ├── OCRLocal.extractText()
│   ├── VisionLocal.analyzeScreenshot()
│   └── RulesEngine.detectBlocker()
├── LLMLocal.analyzeBlocker()
└── Consensus Scoring
    ↓
Blocker Created → Dashboard Broadcast
    ↓
User Resolution → Cloud Sync (optional)
```

### Real-time Dashboard Flow

```
DashboardServer.start()
    ↓
WebSocket Connection
    ↓
Initial State Broadcast
    ├── Current Blockers
    ├── Recent Events
    └── Statistics
    ↓
Real-time Updates
    ├── New Blockers
    ├── Resolved Blockers
    └── Activity Changes
```

## Performance Characteristics

### Latency Targets
- **Activity monitoring**: <50ms
- **Screenshot capture**: <100ms
- **OCR processing**: <200ms
- **Rules matching**: <1ms
- **Vision analysis**: <1000ms
- **LLM inference**: <500ms
- **Consensus scoring**: <10ms
- **Total detection**: <200ms

### Resource Usage
- **Memory**: <500MB baseline, <1GB with models loaded
- **CPU**: <5% average, <20% during analysis
- **Storage**: <100MB for SQLite database
- **Network**: 0 required (optional cloud sync)

## Security & Privacy

### Privacy Controls
1. **Screenshot Capture**: User-configurable on/off
2. **Cloud Sync**: Explicit opt-in required
3. **Data Retention**: Configurable cleanup intervals
4. **Application Filtering**: Whitelist/blacklist apps
5. **Data Export**: User-initiated only

### Data Protection
- **Encryption**: Local data encrypted at rest
- **Access Control**: File system permissions
- **Audit Trail**: All data access logged locally
- **Deletion**: Complete local data removal on uninstall

## Deployment & Distribution

### Packaging
- **Electron Builder**: Cross-platform binaries
- **Auto-updater**: Background model and app updates
- **Installer**: Native platform installers (DMG, EXE, DEB)

### Distribution Channels
- **Direct Download**: GitHub releases
- **Package Managers**: Homebrew, Snap, Chocolatey
- **Enterprise**: Custom deployment packages

## Monitoring & Observability

### Local Metrics
- Blocker detection accuracy
- Response time latency
- Model inference performance
- System resource usage
- User interaction patterns

### Cloud Analytics (Optional)
- Aggregated team productivity metrics
- Blocker type distribution
- Resolution time statistics
- Feature usage analytics

## Future Enhancements

### AI/ML Improvements
- Custom model fine-tuning for developer workflows
- Multi-modal analysis (audio cues for frustration detection)
- Predictive blocker prevention
- Personalized blocker patterns

### Feature Extensions
- IDE plugin integrations
- Team collaboration features
- Historical trend analysis
- Custom blocker pattern creation

### Platform Support
- Mobile development workflow support
- Container-based development environments
- Remote development (VS Code Remote, SSH)

## Conclusion

FlowSight AI represents a fundamental shift from cloud-centric to local-first AI architecture. By processing all data locally and requiring explicit user consent for any cloud interaction, we achieve both superior performance and uncompromising privacy. The hybrid AI approach ensures high accuracy while maintaining the speed and reliability developers need for productive workflows.