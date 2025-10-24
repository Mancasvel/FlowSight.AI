# FlowSight Dashboard

The FlowSight Dashboard is a Next.js 15 application that provides real-time visibility into team activity, ticket progress, and potential blockers.

## Features

- 📊 **Real-time Updates**: Live activity feed via Pusher Channels (<100ms latency)
- 👥 **Team Map**: See what every developer is working on right now
- 🎯 **Ticket Tracking**: Automatic status updates based on developer activity
- 🚨 **Blocker Detection**: AI-powered detection of stuck developers
- 🎨 **Beautiful UI**: Built with Tailwind CSS and Framer Motion
- 🔐 **Secure Auth**: GitHub OAuth via NextAuth.js

## Quick Start

### Development

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your credentials

# Run development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
pnpm build
pnpm start
```

### Deploy to Vercel

```bash
vercel
```

## Environment Variables

Create `.env.local` with these variables:

```env
# MongoDB Atlas
MONGODB_URI=mongodb+srv://...

# Pusher
PUSHER_APP_ID=...
PUSHER_KEY=...
PUSHER_SECRET=...
PUSHER_CLUSTER=us2
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=us2

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...

# GitHub OAuth
GITHUB_ID=...
GITHUB_SECRET=...
```

See `.env.local.example` for details.

## Project Structure

```
src/
├── app/
│   ├── api/              # API routes (serverless functions)
│   │   ├── events/       # POST /api/events - receive agent events
│   │   ├── tickets/      # CRUD operations for tickets
│   │   ├── project/      # GET /api/project/:id/status
│   │   └── auth/         # NextAuth handlers
│   ├── page.tsx          # Main dashboard page
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── TeamMap.tsx       # Developer activity grid
│   ├── Timeline.tsx      # Recent events timeline
│   ├── ProjectStats.tsx  # Stats cards
│   └── DashboardLayout.tsx
├── hooks/
│   └── usePusher.ts      # Pusher client hook
└── lib/
    ├── mongodb.ts        # MongoDB connection
    ├── pusher.ts         # Pusher server instance
    └── rules-engine.ts   # Automation rules
```

## API Routes

### POST /api/events

Receives semantic events from agents.

**Request:**
```json
{
  "devId": "dev@example.com",
  "timestamp": "2025-10-24T10:00:00Z",
  "activity": "coding",
  "application": "VSCode",
  "gitBranch": "feature/FE-123-dashboard",
  "ticketId": "FE-123"
}
```

**Response:**
```json
{
  "success": true,
  "eventId": "507f1f77bcf86cd799439011",
  "triggeredActions": [
    "Auto mark In Progress: update_ticket_status"
  ]
}
```

**Authentication:** Bearer token in `Authorization` header

### GET /api/project/:id/status

Get aggregated project status.

**Response:**
```json
{
  "project": { ... },
  "developers": [ ... ],
  "tickets": [ ... ],
  "recentEvents": [ ... ]
}
```

### POST /api/tickets

Create or update a ticket.

### PATCH /api/tickets

Update ticket status/progress.

## Components

### TeamMap

Shows real-time developer activity:
- Current application and file
- Assigned ticket
- Status (active, idle, blocked)
- Progress indicator

### Timeline

Scrollable list of recent events:
- Developer avatar
- Activity type (coding, browsing, etc.)
- Ticket ID
- Time ago

### ProjectStats

Statistics cards:
- Active developers
- Completed tickets
- In-progress tickets
- Blocked tickets

## Hooks

### usePusher

React hook for real-time updates:

```typescript
const { subscribe, unsubscribe } = usePusher();

useEffect(() => {
  const channel = subscribe('project:default');
  
  channel.bind('event', (data) => {
    console.log('New event:', data);
  });

  return () => channel.unbind_all();
}, [subscribe]);
```

## Rules Engine

Automatically triggers actions based on events:

**Built-in Rules:**

1. **Auto In Progress**
   - Condition: Coding on a ticket branch
   - Action: Mark ticket "in_progress"

2. **Detect Blocker**
   - Condition: >70% browsing activity
   - Action: Mark ticket "blocked"

3. **Progress on Commit**
   - Condition: Commit detected
   - Action: Increase progress +10%

**Customize in:** `src/lib/rules-engine.ts`

## MongoDB Schema

### events
```typescript
{
  devId: string;
  timestamp: Date;
  activity: ActivityType;
  application?: string;
  filePath?: string;
  gitBranch?: string;
  ticketId?: string;
  meta?: object;
}
```

### tickets
```typescript
{
  ticketId: string;
  projectId: string;
  status: TicketStatus;
  progress: number;
  assignedTo?: string;
  lastUpdatedBy: string;
  lastUpdatedAt: Date;
}
```

### projects
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

### users
```typescript
{
  userId: string;
  email: string;
  name: string;
  role: 'dev' | 'pm' | 'admin';
  projectIds: string[];
}
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Environment Variables:**

Add all variables from `.env.local` in Vercel dashboard:
Settings → Environment Variables

**Edge Config:**
- Region: Closest to your team
- Function Timeout: 10s
- Memory: 1024MB

### Self-Hosted

```bash
pnpm build
pnpm start
```

Requires Node.js 18+ server.

## Performance

- **Initial Load**: ~500ms (3G)
- **Real-time Latency**: <100ms
- **API Response**: p95 <200ms
- **Bundle Size**: ~350KB (gzipped)

## Security

- **Authentication**: GitHub OAuth via NextAuth.js
- **Authorization**: Role-based (dev, pm, admin)
- **API Keys**: Bearer token validation
- **HTTPS**: Required in production
- **CORS**: Restricted to dashboard domain

## Troubleshooting

### "Failed to fetch" on dashboard

**Solution:**
1. Check MongoDB URI is correct
2. Verify network access in MongoDB Atlas
3. Check environment variables are set

### No real-time updates

**Solution:**
1. Check Pusher credentials
2. Verify `NEXT_PUBLIC_*` variables
3. Open browser console for Pusher errors
4. Check Pusher dashboard for messages

### Build errors

**Solution:**
1. Delete `.next` folder
2. Run `pnpm install`
3. Run `pnpm build` again

## Development Tips

### Hot Reload

Next.js 15 includes Fast Refresh. Changes to components reload instantly.

### API Testing

Use the `/api/events` endpoint with curl:

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fsa_your_key" \
  -d '{
    "devId": "test@example.com",
    "timestamp": "2025-10-24T10:00:00Z",
    "activity": "coding",
    "ticketId": "TEST-123"
  }'
```

### MongoDB GUI

Use [MongoDB Compass](https://www.mongodb.com/products/compass) to browse data.

## Contributing

See main project README for contribution guidelines.

## License

MIT - See LICENSE file

---

**Built with Next.js 15, TypeScript, and ❤️**

