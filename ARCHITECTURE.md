# FlowSight AI - Technical Architecture

## System Overview

FlowSight AI is a distributed, serverless application designed for real-time developer activity monitoring. The architecture prioritizes privacy, scalability, and real-time performance.

## Core Principles

1. **Privacy-First**: Screen analysis happens locally; only semantic events are transmitted
2. **Serverless**: All backend logic runs as Vercel Edge/Serverless functions
3. **Real-time**: Pusher Channels provide <100ms update latency
4. **Scalable**: MongoDB Atlas handles elastic workload scaling
5. **Type-Safe**: End-to-end TypeScript with Zod validation

## Component Architecture

### 1. Electron Agent (Client)

**Technology Stack:**
- Electron 28
- TypeScript 5.3
- Tesseract.js (OCR)
- screenshot-desktop (screen capture)
- active-win (window detection)

**Responsibilities:**
- Capture active window information every 30s (configurable)
- Detect application type (VSCode, Chrome, Terminal, etc.)
- Extract file paths and git information for code editors
- Perform local OCR to detect ticket IDs
- Build semantic event objects (no images)
- POST events to Vercel API via HTTPS

**Data Flow:**
```
OS APIs → Activity Monitor → Event Builder → HTTP Client → Vercel API
  ↓
Screen Capture (optional) → OCR → Ticket ID Extraction → Discard image
```

**Privacy Measures:**
- Screenshots never leave the device
- Only ticket IDs and metadata extracted
- User can disable screen capture entirely
- File paths sanitized (user directories redacted)

### 2. Next.js Dashboard (Frontend + API)

**Technology Stack:**
- Next.js 15 (App Router)
- React 18.3
- TypeScript 5.3
- Tailwind CSS 3.4
- Framer Motion 11
- Pusher JS Client
- NextAuth.js (GitHub OAuth)

**API Routes (Serverless Functions):**

#### POST /api/events
- Validates API key from Authorization header
- Parses and validates event with Zod schema
- Stores event in MongoDB
- Runs rules engine
- Triggers Pusher updates
- Returns triggered actions

**Code Flow:**
```typescript
Request → API Key Validation → Zod Validation → MongoDB Insert 
  → Rules Engine → Pusher Trigger → Response
```

#### GET /api/project/[id]/status
- Fetches project info from MongoDB
- Aggregates tickets by status
- Retrieves last 24h events
- Builds developer status map
- Returns combined response

#### POST /api/tickets
- Creates or updates tickets
- Triggers Pusher updates
- Returns updated ticket

#### PATCH /api/tickets
- Updates ticket status/progress
- Logs manual PM overrides
- Triggers real-time updates

### 3. MongoDB Atlas (Persistence)

**Collections:**

#### events
```typescript
{
  _id: ObjectId,
  devId: string,           // Developer identifier
  timestamp: Date,
  activity: ActivityType,  // coding, browsing, terminal, etc.
  application?: string,    // VSCode, Chrome, etc.
  filePath?: string,       // Current file (sanitized)
  gitBranch?: string,      // Git branch name
  gitRepo?: string,        // Repository name
  ticketId?: string,       // Extracted ticket ID
  meta?: object,           // Additional context
  createdAt: Date
}
```

**Indexes:**
- `{ devId: 1, timestamp: -1 }` - Developer activity timeline
- `{ ticketId: 1, timestamp: -1 }` - Ticket activity history
- `{ timestamp: -1 }` - Global timeline

#### tickets
```typescript
{
  _id: ObjectId,
  ticketId: string,        // Unique ticket ID (e.g., FE-123)
  projectId: string,       // Project reference
  title: string,
  status: TicketStatus,    // todo, in_progress, blocked, etc.
  progress: number,        // 0-100
  assignedTo?: string,     // Developer ID
  lastUpdatedBy: string,   // 'system' or user ID
  lastUpdatedAt: Date,
  blockerReason?: string,  // Why ticket is blocked
  externalUrl?: string,    // Jira/Linear link
  createdAt: Date
}
```

**Indexes:**
- `{ ticketId: 1 }` - Unique constraint
- `{ projectId: 1, status: 1 }` - Project tickets by status
- `{ assignedTo: 1 }` - Developer tickets

#### projects
```typescript
{
  _id: ObjectId,
  projectId: string,
  name: string,
  description?: string,
  repoUrl?: string,
  jiraUrl?: string,
  teamMembers: string[],   // Array of dev IDs
  createdAt: Date,
  settings: {
    autoUpdateJira: boolean,
    blockDetectionThreshold: number,
    pusherChannelName: string
  }
}
```

#### users
```typescript
{
  _id: ObjectId,
  userId: string,
  email: string,
  name: string,
  avatar?: string,
  role: 'dev' | 'pm' | 'admin',
  projectIds: string[],
  githubId?: string,
  createdAt: Date
}
```

### 4. Pusher Channels (Real-time)

**Channel Structure:**

- `dev:{devId}` - Individual developer events
- `project:{projectId}` - Project-wide updates
- `ticket:{ticketId}` - Ticket-specific updates

**Event Types:**
- `event` - New semantic event
- `ticket_update` - Ticket status/progress changed
- `dev_status` - Developer status changed
- `status_change` - Generic status update

**Message Format:**
```typescript
{
  type: 'event' | 'ticket_update' | ...,
  payload: any,
  timestamp: string
}
```

**Client Subscription:**
```typescript
const pusher = new PusherClient(key, { cluster });
const channel = pusher.subscribe('project:default');
channel.bind('event', (data) => {
  // Update UI
});
```

### 5. Rules Engine

**Architecture:**

The rules engine is a lightweight, in-process system that evaluates semantic events against predefined rules and executes actions.

**Rule Structure:**
```typescript
{
  id: string,
  name: string,
  conditions: [
    { field: 'activity', operator: 'equals', value: 'coding' },
    { field: 'gitBranch', operator: 'contains', value: '-' }
  ],
  actions: [
    { type: 'update_ticket_status', params: { status: 'in_progress' } }
  ],
  enabled: boolean
}
```

**Execution Flow:**
```
Event Received → Rules Engine.processEvent()
  → Evaluate each rule's conditions
  → If all conditions match:
      → Execute each action
      → Log triggered action
  → Return list of triggered actions
```

**Available Actions:**
1. `update_ticket_status` - Change ticket status
2. `set_blocked` - Mark ticket as blocked with reason
3. `increase_progress` - Increment progress percentage
4. `send_notification` - Trigger notification (TODO)

**Blocker Detection Algorithm:**
```typescript
// Get last 20 events for developer (last 1 hour)
const recentEvents = await getRecentEvents(devId, 20, 60min);

// Calculate browsing ratio
const browsingRatio = browsingEvents.length / totalEvents.length;

// If >70% browsing, mark as blocked
if (browsingRatio > 0.7 && totalEvents > 10) {
  setBlocked(ticketId, 'Excessive research activity detected');
}
```

## Data Flow Diagrams

### Event Capture Flow

```
┌─────────────────┐
│  Developer's    │
│  Active Window  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Activity Monitor│ (every 30s)
│  - Get window   │
│  - Detect app   │
│  - Read git     │
│  - OCR screen   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Semantic Event  │
│   {devId, ...}  │
└────────┬────────┘
         │
         ▼ HTTPS POST
┌─────────────────┐
│ /api/events     │
│  (Vercel)       │
└────────┬────────┘
         │
         ├──────────────┐
         ▼              ▼
    ┌─────────┐   ┌──────────┐
    │ MongoDB │   │  Pusher  │
    │  Store  │   │ Trigger  │
    └─────────┘   └────┬─────┘
                       │
                       ▼
                 ┌──────────────┐
                 │  Dashboard   │
                 │  (Real-time) │
                 └──────────────┘
```

### Rules Engine Flow

```
┌─────────────────┐
│  Semantic Event │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rules Engine   │
└────────┬────────┘
         │
         ├─────► Rule 1: Auto In Progress
         │         ├─ activity == 'coding' ?
         │         ├─ gitBranch contains ticket ?
         │         └─ → Update ticket status
         │
         ├─────► Rule 2: Detect Blocker
         │         ├─ Get recent events
         │         ├─ Calculate browsing ratio
         │         └─ → Set blocked if >70%
         │
         └─────► Rule 3: Progress on Commit
                   ├─ meta contains 'commit' ?
                   └─ → Increase progress +10%
```

### Real-time Update Flow

```
┌─────────────────┐
│  POST /api/     │
│  events         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ pusherServer    │
│  .trigger()     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Pusher Service  │
│  (Managed)      │
└────────┬────────┘
         │
         ├──────────┐
         ▼          ▼
    ┌────────┐  ┌────────┐
    │Client 1│  │Client 2│
    │(PM)    │  │(Dev)   │
    └────────┘  └────────┘
```

## Security Considerations

### 1. API Authentication
- Agent uses Bearer token authentication
- Tokens follow format: `fsa_` + 48 random alphanumeric chars
- Validated on every API request
- TODO: Store valid tokens in MongoDB with rate limits

### 2. Dashboard Authentication
- GitHub OAuth via NextAuth.js
- Session stored in encrypted JWT
- Role-based access control (dev, pm, admin)

### 3. Data Privacy
- Screenshots never stored or transmitted
- File paths sanitized (user dirs redacted)
- Events contain minimal metadata
- MongoDB encrypted at rest (Atlas default)

### 4. Network Security
- All communication over HTTPS
- Vercel provides automatic SSL
- MongoDB Atlas requires TLS 1.2+
- Pusher uses WSS (WebSocket Secure)

## Performance Characteristics

### Latency
- Agent → API: ~100-200ms (depends on network)
- API → MongoDB: ~10-50ms (Atlas cluster)
- API → Pusher: ~20-50ms
- Pusher → Client: <100ms
- **Total end-to-end**: ~200-400ms

### Throughput
- Vercel: 100,000 function invocations/day (free tier)
- MongoDB Atlas: 512MB storage, unlimited reads (free tier)
- Pusher: 200k messages/day (free tier)
- **Supports**: ~50 developers with 30s capture interval

### Scaling
- **50 devs**: Free tier sufficient
- **500 devs**: Upgrade to Vercel Pro ($20/mo), Atlas M10 ($57/mo), Pusher Startup ($49/mo)
- **5000 devs**: Vercel Enterprise, Atlas M30, Pusher Business

## Deployment

### Vercel Deployment

```bash
cd apps/dashboard
vercel
```

**Environment Variables (Vercel Dashboard):**
- `MONGODB_URI`
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `GITHUB_ID`, `GITHUB_SECRET`
- `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`

**Vercel Edge Config:**
- **Region**: Closest to team (e.g., `us-east-1` for US teams)
- **Function Timeout**: 10s (default)
- **Memory**: 1024MB (default, increase if needed)

### MongoDB Atlas Setup

1. Create cluster (M0 free tier or M10 for production)
2. Database Access: Create user with read/write permissions
3. Network Access: Add IP (0.0.0.0/0 for Vercel, or use Vercel IPs)
4. Connect: Get connection string

**Recommended Indexes:**
```javascript
db.events.createIndex({ devId: 1, timestamp: -1 });
db.events.createIndex({ ticketId: 1, timestamp: -1 });
db.events.createIndex({ timestamp: -1 });
db.tickets.createIndex({ ticketId: 1 }, { unique: true });
db.tickets.createIndex({ projectId: 1, status: 1 });
```

### Pusher Setup

1. Create account at pusher.com
2. Create Channels app
3. Note credentials (app_id, key, secret, cluster)
4. Enable client events (optional, for future features)

## Monitoring & Observability

### Logs
- **Vercel**: Automatic function logs in dashboard
- **MongoDB**: Query metrics in Atlas dashboard
- **Pusher**: Message counts and connection stats

### Metrics to Track
- Agent → API success rate
- Rules engine trigger rate
- Pusher delivery rate
- Dashboard load time
- API p95 latency

### Alerts
- MongoDB connection failures
- Pusher message failures
- Vercel function errors >1% error rate
- Agent offline >5 minutes

## Future Enhancements

### Phase 2: AI Integration
- GPT-4 analysis of activity patterns
- Smart blocker detection with context
- Automated commit message analysis
- Code complexity scoring

### Phase 3: Integrations
- Jira/Linear two-way sync
- Slack/Teams notifications
- GitHub PR automation
- Calendar integration for meeting detection

### Phase 4: Advanced Analytics
- Weekly productivity reports
- Team velocity trends
- Burnout detection
- Focus time analysis

## Troubleshooting

### Agent not sending events
1. Check API URL in agent config
2. Verify API key format (fsa_...)
3. Check network connectivity
4. View Vercel function logs

### Dashboard not updating
1. Check Pusher credentials in .env.local
2. Verify client connected (browser console)
3. Check Pusher dashboard for messages
4. Ensure channel subscription matches projectId

### MongoDB connection issues
1. Verify connection string format
2. Check IP whitelist in Atlas
3. Ensure user has correct permissions
4. Test connection with MongoDB Compass

---

**Last Updated**: October 24, 2025

