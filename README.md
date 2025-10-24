# FlowSight AI

> Real-time developer activity monitoring and intelligent automation platform

FlowSight AI is a privacy-first developer productivity tool that automatically tracks coding activity, detects blockers, and keeps project managers informed in real-time—without ever storing screenshots or sensitive data.

## 🎯 Features

- **🔒 Privacy-First**: All screen analysis happens locally; only semantic events are sent to the cloud
- **⚡ Real-time Dashboard**: Live updates via Pusher showing team activity, ticket progress, and blockers
- **🤖 Intelligent Automation**: Rules engine automatically updates ticket statuses based on developer activity
- **🧠 AI-Powered Analysis**: Uses GPT-4/Claude via OpenRouter to detect blockers, analyze productivity, and estimate completion times
- **🏢 Enterprise-Ready**: Support for custom AI models (on-premise or cloud) for maximum privacy
- **🎨 Beautiful UI**: Modern dashboard built with Next.js 15, Tailwind CSS, and Framer Motion
- **☁️ Serverless Architecture**: Deployed on Vercel with MongoDB Atlas and Pusher Channels

## 📐 Architecture

```mermaid
graph TB
    Agent[Electron Agent<br/>Local Machine]
    API[Next.js API Routes<br/>Vercel Serverless]
    DB[(MongoDB Atlas)]
    Pusher[Pusher Channels<br/>Real-time]
    Dashboard[Next.js Dashboard<br/>Vercel]
    
    Agent -->|HTTPS POST<br/>Semantic Events| API
    API -->|Store Events| DB
    API -->|Read/Write| DB
    API -->|Trigger Updates| Pusher
    Pusher -->|Subscribe| Dashboard
    Dashboard -->|Fetch Data| API
    
    subgraph "Local Processing"
        Agent
        Screen[Screen Capture] --> Agent
        OCR[Tesseract.js<br/>OCR] --> Agent
        Git[Git Info] --> Agent
    end
    
    subgraph "Cloud (Vercel + MongoDB)"
        API
        Rules[Rules Engine] --> API
        DB
    end
    
    subgraph "Real-time Layer"
        Pusher
    end
    
    style Agent fill:#667eea
    style Dashboard fill:#764ba2
    style API fill:#48bb78
    style DB fill:#ed8936
    style Pusher fill:#f6ad55
```

## 🗂️ Project Structure

```
FlowSight.AI/
├── apps/
│   ├── agent/              # Electron + TypeScript agent
│   │   ├── src/
│   │   │   ├── main/       # Main process
│   │   │   │   ├── index.ts
│   │   │   │   └── services/
│   │   │   │       ├── ActivityMonitor.ts
│   │   │   │       ├── ConfigManager.ts
│   │   │   │       └── EventSender.ts
│   │   │   ├── preload/    # Preload scripts
│   │   │   └── renderer/   # UI (HTML)
│   │   └── package.json
│   │
│   └── dashboard/          # Next.js 15 dashboard
│       ├── src/
│       │   ├── app/
│       │   │   ├── api/    # Serverless API routes
│       │   │   │   ├── events/
│       │   │   │   ├── tickets/
│       │   │   │   ├── project/[id]/status/
│       │   │   │   └── auth/[...nextauth]/
│       │   │   ├── page.tsx
│       │   │   └── layout.tsx
│       │   ├── components/ # React components
│       │   │   ├── TeamMap.tsx
│       │   │   ├── Timeline.tsx
│       │   │   └── ProjectStats.tsx
│       │   ├── hooks/      # Custom hooks
│       │   └── lib/        # Utilities
│       │       ├── mongodb.ts
│       │       ├── pusher.ts
│       │       └── rules-engine.ts
│       └── package.json
│
└── packages/
    └── shared/             # Shared types & utilities
        ├── src/
        │   ├── types.ts    # Zod schemas & TypeScript types
        │   └── utils.ts    # Shared functions
        └── package.json
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** 8+
- **MongoDB Atlas** account (free tier works)
- **Pusher** account (free tier works)
- **GitHub OAuth App** (for dashboard authentication)
- **OpenRouter API Key** (optional, for AI features - free tier available)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd FlowSight.AI
pnpm install
```

### 2. Setup MongoDB Atlas

1. Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a database named `flowsight`
3. Get your connection string (looks like `mongodb+srv://...`)
4. Whitelist your IP or allow access from anywhere (0.0.0.0/0)

### 3. Setup Pusher

1. Create a free account at [pusher.com](https://pusher.com)
2. Create a new Channels app
3. Note down your credentials: `app_id`, `key`, `secret`, `cluster`

### 4. Setup GitHub OAuth

1. Go to [GitHub Settings > Developer > OAuth Apps](https://github.com/settings/developers)
2. Create a new OAuth App:
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Note down `Client ID` and `Client Secret`

### 4.5 Setup OpenRouter (Optional - AI Features)

1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Navigate to [openrouter.ai/keys](https://openrouter.ai/keys)
3. Click "Create Key" and copy your API key (starts with `sk-or-v1-...`)
4. **Free tier**: $1 of credits to start, then pay-as-you-go
5. **Recommended model**: `anthropic/claude-3-sonnet` (~$85/month for 50 developers)

### 5. Configure Dashboard

```bash
cd apps/dashboard
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/flowsight
PUSHER_APP_ID=your_app_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
PUSHER_CLUSTER=us2
NEXT_PUBLIC_PUSHER_KEY=your_key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
GITHUB_ID=your_github_client_id
GITHUB_SECRET=your_github_client_secret

# AI Features (Optional but Recommended)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
DEFAULT_AI_MODEL=anthropic/claude-3-sonnet
```

### 6. Run Dashboard (Dev Mode)

```bash
cd apps/dashboard
pnpm dev
```

Dashboard will be available at [http://localhost:3000](http://localhost:3000)

### 7. Configure Agent

Open the agent, go to settings, and configure:
- **API URL**: `http://localhost:3000` (or your Vercel URL in production)
- **API Key**: Generate one with format `fsa_` followed by 48 random alphanumeric characters
- **Developer ID**: Your email or unique identifier

### 8. Run Agent (Dev Mode)

```bash
cd apps/agent
pnpm dev
```

The agent window will open. Click "Start Monitoring" to begin tracking activity.

### 9. Test with Simulated Events

In the agent UI, use the Dev Mode section to simulate events:
- Click "💻 Coding" to simulate coding activity
- Click "🌐 Browsing" to simulate browsing
- Click "🧪 Testing" to simulate testing
- Click "⌨️ Terminal" to simulate terminal usage

Watch the dashboard update in real-time!

### 10. Test AI Features (Optional)

If you configured OpenRouter:

```bash
# Check AI status
curl http://localhost:3000/api/ai/analyze/status

# Should return: {"available": true, "providers": {"openrouter": true}}

# Manual AI analysis
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "devId": "your@email.com",
    "analysisType": "blocker"
  }'
```

The AI will automatically run every ~10 events to detect blockers, analyze productivity, and estimate completion times. Check the dashboard logs for "AI Blocker Analysis Result".

## 📦 Deploy to Production

### Deploy Dashboard to Vercel

```bash
cd apps/dashboard
vercel
```

Follow the prompts and add your environment variables in Vercel dashboard.

### Build Agent for Distribution

```bash
cd apps/agent
pnpm build
pnpm package
```

Installers will be in `apps/agent/dist-electron/`

## 🔧 Configuration

### Rules Engine

The rules engine automatically triggers actions based on developer activity. Default rules in `apps/dashboard/src/lib/rules-engine.ts`:

1. **Auto In Progress**: When developer starts coding on a ticket branch, mark it "In Progress"
2. **AI-Powered Blocker Detection** (if OpenRouter configured): Uses GPT-4/Claude to intelligently detect blockers based on activity patterns
3. **Simple Blocker Detection** (fallback): If excessive browsing activity (>70%), mark as "Blocked"
4. **Progress on Commit**: When a commit is detected, increase ticket progress by 10%

Customize rules by editing the `getDefaultRules()` method.

### AI Configuration

**Quick Start:** See `AI_QUICKSTART.md` for 5-minute setup

**Full Documentation:** See `AI_INTEGRATION.md` for:
- Multi-provider support (OpenRouter, OpenAI, Custom)
- Cost analysis and optimization
- Enterprise deployment with custom models
- API reference

**Per-Project Configuration:**
```bash
# Configure custom AI model for a project
curl -X PUT http://localhost:3000/api/projects/my-project/ai-config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "custom",
    "apiKey": "your-key",
    "model": "company-llama-70b",
    "baseURL": "https://ai.company.com/v1"
  }'
```

### Agent Capture Interval

Default: 30 seconds. Adjust in agent settings or `apps/agent/src/main/services/ConfigManager.ts`.

### Privacy Settings

- **Enable Screen Capture**: Turn off to disable screenshot OCR
- **Enable OCR**: Turn off to skip ticket ID detection from screenshots
- **Enable Activity Detection**: Turn off to stop all monitoring

## 📊 MongoDB Collections

### `events`
```typescript
{
  devId: string;
  timestamp: Date;
  activity: 'coding' | 'browsing' | 'terminal' | ...;
  application?: string;
  filePath?: string;
  gitBranch?: string;
  ticketId?: string;
  meta?: object;
}
```

### `tickets`
```typescript
{
  ticketId: string;
  projectId: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done';
  progress: number; // 0-100
  assignedTo?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt: Date;
}
```

### `projects`
```typescript
{
  projectId: string;
  name: string;
  teamMembers: string[];
  settings: {
    autoUpdateJira: boolean;
    blockDetectionThreshold: number;
  };
}
```

### `users`
```typescript
{
  userId: string;
  email: string;
  name: string;
  role: 'dev' | 'pm' | 'admin';
  projectIds: string[];
}
```

## 🔐 Security

- **API Keys**: Use strong random keys (48+ chars)
- **No Image Storage**: Screenshots are processed locally and discarded
- **MongoDB**: Use Atlas with proper authentication
- **Environment Variables**: Never commit `.env.local` files
- **HTTPS**: Always use HTTPS in production

## 🧪 Testing

### Test Agent → API Flow

1. Start dashboard: `cd apps/dashboard && pnpm dev`
2. Start agent: `cd apps/agent && pnpm dev`
3. Click "Start Monitoring" in agent
4. Use "Dev Mode" to simulate events
5. Watch dashboard update in real-time

### Test Rules Engine

Send a POST request to `/api/events` with a coding event on a ticket branch:

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsa_your_api_key" \
  -d '{
    "devId": "dev@example.com",
    "timestamp": "2025-10-24T10:00:00Z",
    "activity": "coding",
    "gitBranch": "feature/FE-123-dashboard",
    "application": "VSCode"
  }'
```

Check MongoDB to see if ticket `FE-123` was created/updated with status "in_progress".

## 🛣️ Roadmap

### V2 - Enhanced Intelligence (Q1 2026)
- **AI-powered blocker detection** using GPT-4 to analyze activity patterns
- **Smart time estimates** based on historical data
- **Slack/Teams notifications** for blockers and status changes
- **Jira/Linear integration** for two-way ticket sync
- **Code review automation** - auto-assign reviewers based on expertise

### V3 - Team Insights (Q2 2026)
- **Weekly productivity reports** with trends and insights
- **Burnout detection** using activity patterns and time tracking
- **Team health dashboard** showing morale, velocity, and blockers
- **Custom rules builder** - no-code rules engine configuration
- **Mobile app** for PMs to monitor on-the-go

### V4 - Enterprise Features (Q3 2026)
- **Multi-tenant architecture** with organization support
- **RBAC** (Role-Based Access Control) for fine-grained permissions
- **Audit logs** for compliance and security
- **On-premise deployment** option for sensitive environments
- **SSO integration** (Okta, Auth0, SAML)

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - See LICENSE file for details

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/flowsight-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/flowsight-ai/discussions)
- **Email**: support@flowsight.ai

## 🙏 Acknowledgments

- Built with [Next.js 15](https://nextjs.org/)
- Screen capture via [screenshot-desktop](https://github.com/bencevans/screenshot-desktop)
- OCR powered by [Tesseract.js](https://tesseract.projectnaptha.com/)
- Real-time updates by [Pusher](https://pusher.com/)
- Database hosted on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Deployed on [Vercel](https://vercel.com/)

---

**Built with ❤️ for developers and PMs who want to work smarter, not harder.**

