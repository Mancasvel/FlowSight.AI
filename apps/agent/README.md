# FlowSight Agent

The FlowSight Agent is an Electron desktop application that runs locally on each developer's machine to capture activity and send semantic events to the FlowSight API.

## Features

- 🔒 **Privacy-First**: All analysis happens locally; screenshots never leave your machine
- 🖥️ **Window Detection**: Automatically detects active application and extracts context
- 🔍 **Smart Analysis**: OCR-based ticket ID detection, git branch extraction
- 🎨 **Simple UI**: Easy configuration and monitoring
- 🧪 **Dev Mode**: Simulate events for testing without actual screen capture

## Quick Start

### Development

```bash
pnpm install
pnpm dev
```

### Production Build

```bash
pnpm build
pnpm package
```

Installers will be created in `dist-electron/`

## Configuration

### Required Settings

- **API URL**: The FlowSight dashboard URL (e.g., `https://your-app.vercel.app`)
- **API Key**: Your authentication key (format: `fsa_` + 48 alphanumeric characters)
- **Developer ID**: Your email or unique identifier

### Optional Settings

- **Capture Interval**: How often to capture activity (default: 30 seconds)
- **Enable Screen Capture**: Allow screenshot capture for OCR (privacy-sensitive)
- **Enable OCR**: Extract ticket IDs from screenshots
- **Enable Activity Detection**: Monitor active applications

## How It Works

1. **Activity Monitor** runs on an interval (default 30s)
2. Captures active window information via OS APIs
3. Detects application type (VSCode, Chrome, Terminal, etc.)
4. For code editors:
   - Extracts current file path
   - Reads git branch name
   - Looks up repository name
5. Optionally performs OCR on screenshots to detect ticket IDs
6. Builds a semantic event object (no images)
7. POSTs event to FlowSight API via HTTPS

## Privacy & Security

### What is Captured

✅ Active application name (e.g., "VSCode", "Chrome")
✅ Window title
✅ File path (sanitized - user directories redacted)
✅ Git branch and repository name
✅ Ticket IDs (extracted via OCR or git branch)

### What is NOT Captured

❌ Screenshots (processed locally, immediately discarded)
❌ File contents
❌ Keystrokes
❌ Mouse movements
❌ Other windows/applications
❌ Personal files or data

### You Control Everything

- Turn off screen capture entirely
- Disable OCR
- Stop monitoring at any time
- Uninstall without trace

## Developer Mode

Use the **Dev Mode** section to simulate events without actual monitoring:

- **💻 Coding**: Simulates coding in VSCode on ticket `FE-123`
- **🌐 Browsing**: Simulates browsing StackOverflow
- **🧪 Testing**: Simulates testing on localhost
- **⌨️ Terminal**: Simulates terminal usage on ticket `BE-456`

Perfect for testing the dashboard without running actual monitoring.

## System Requirements

- **macOS**: 10.13 (High Sierra) or later
- **Windows**: Windows 10 or later
- **Linux**: Ubuntu 18.04, Fedora 32, or equivalent

## Permissions Required

### macOS
- **Screen Recording**: Required for activity detection and OCR
- **Accessibility**: Required to read active window information

Grant permissions in:
System Preferences → Security & Privacy → Privacy

### Windows
- No special permissions required

### Linux
- X11 or Wayland display server
- May require `xdotool` for window detection

## Troubleshooting

### Agent shows "Not Configured"

**Solution**: Fill in API URL, API Key, and Developer ID in the settings, then click "Save Config"

### "Failed to send event" errors

**Possible causes:**
1. API URL is incorrect
2. API Key format is invalid (must start with `fsa_`)
3. Dashboard is not running
4. Network connection issue

**Solution**: Check configuration and verify dashboard is accessible

### No activity detected

**Solution**: 
1. Grant screen recording permission (macOS)
2. Enable Activity Detection in settings
3. Try using Dev Mode to test connectivity

### OCR not working

**Solution**:
1. Enable Screen Capture in settings
2. Enable OCR in settings
3. Tesseract.js will download on first use (may take 1-2 minutes)

## Building from Source

### Prerequisites

- Node.js 18+
- pnpm 8+

### Clone and Install

```bash
git clone <repo-url>
cd FlowSight.AI/apps/agent
pnpm install
```

### Run Development Build

```bash
pnpm dev
```

### Build for Production

```bash
# Build TypeScript
pnpm build

# Create installer
pnpm package
```

### Platform-Specific Builds

```bash
# macOS
pnpm package -- --mac

# Windows
pnpm package -- --win

# Linux
pnpm package -- --linux
```

## Architecture

### Main Process (`src/main/`)

- **index.ts**: Electron main process entry point
- **services/ActivityMonitor.ts**: Core activity capture logic
- **services/ConfigManager.ts**: Configuration persistence
- **services/EventSender.ts**: HTTP client for API communication

### Preload (`src/preload/`)

- **index.ts**: IPC bridge between main and renderer processes

### Renderer (`src/renderer/`)

- **index.html**: UI for configuration and monitoring

### Dependencies

- **electron**: Desktop app framework
- **active-win**: Active window detection
- **screenshot-desktop**: Screen capture
- **tesseract.js**: OCR engine
- **axios**: HTTP client
- **electron-store**: Configuration storage

## API Integration

### Event Format

```typescript
{
  devId: string;          // Developer identifier
  timestamp: string;      // ISO 8601 timestamp
  activity: ActivityType; // 'coding', 'browsing', 'terminal', etc.
  application?: string;   // 'VSCode', 'Chrome', etc.
  filePath?: string;      // Current file (sanitized)
  gitBranch?: string;     // Git branch name
  gitRepo?: string;       // Repository name
  ticketId?: string;      // Extracted ticket ID
  meta?: object;          // Additional context
}
```

### API Endpoint

```http
POST /api/events
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "devId": "dev@example.com",
  "timestamp": "2025-10-24T10:00:00Z",
  "activity": "coding",
  "application": "VSCode",
  "filePath": "/Users/***/projects/app/src/Dashboard.tsx",
  "gitBranch": "feature/FE-123-dashboard",
  "ticketId": "FE-123"
}
```

## Contributing

Contributions welcome! Please read the main project README for guidelines.

## License

MIT - See LICENSE file

---

**Built with ❤️ for developers who value privacy**

