# FlowSight AI - Complete Setup Guide

This guide will walk you through setting up FlowSight AI from scratch, including all third-party services.

## Prerequisites

Before you begin, ensure you have:

- [ ] Node.js 18+ installed ([nodejs.org](https://nodejs.org/))
- [ ] pnpm 8+ installed (`npm install -g pnpm`)
- [ ] Git installed
- [ ] A code editor (VS Code recommended)

## Part 1: Third-Party Services Setup

### 1.1 MongoDB Atlas (Database)

**Time Required: 10 minutes**

1. **Create Account**
   - Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Click "Try Free" and create an account
   - Choose "Shared Clusters" (free tier)

2. **Create Cluster**
   - Click "Create a Cluster"
   - Choose AWS, region closest to you (e.g., `us-east-1`)
   - Cluster Tier: M0 Sandbox (free)
   - Cluster Name: `flowsight-cluster`
   - Click "Create Cluster" (takes 3-5 minutes)

3. **Configure Database Access**
   - Go to "Database Access" in left sidebar
   - Click "Add New Database User"
   - Authentication Method: Password
   - Username: `flowsight-admin`
   - Password: Click "Autogenerate Secure Password" and save it
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

4. **Configure Network Access**
   - Go to "Network Access" in left sidebar
   - Click "Add IP Address"
   - For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
   - For production: Add your Vercel deployment IPs
   - Click "Confirm"

5. **Get Connection String**
   - Go to "Database" in left sidebar
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Driver: Node.js, Version: 5.5 or later
   - Copy the connection string (looks like: `mongodb+srv://flowsight-admin:<password>@flowsight-cluster.xxxxx.mongodb.net/`)
   - Replace `<password>` with your actual password
   - Add database name: `...mongodb.net/flowsight?retryWrites=true&w=majority`
   - Save this for later

### 1.2 Pusher Channels (Real-time)

**Time Required: 5 minutes**

1. **Create Account**
   - Go to [pusher.com](https://pusher.com)
   - Click "Sign Up" and create an account
   - Choose "Channels" product
   - Select free "Sandbox" plan (200k messages/day)

2. **Create Channels App**
   - Click "Create app"
   - Name: `flowsight-realtime`
   - Cluster: Choose closest to you (e.g., `us2`, `eu`)
   - Tech Stack: Node.js (backend), Vanilla JS (frontend)
   - Click "Create app"

3. **Get Credentials**
   - Go to "App Keys" tab
   - Copy and save these values:
     - `app_id`: e.g., `1234567`
     - `key`: e.g., `abcdef123456`
     - `secret`: e.g., `secret123456`
     - `cluster`: e.g., `us2`

### 1.3 GitHub OAuth (Authentication)

**Time Required: 5 minutes**

1. **Create OAuth App**
   - Go to [github.com/settings/developers](https://github.com/settings/developers)
   - Click "OAuth Apps" → "New OAuth App"
   - Application name: `FlowSight AI (Dev)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
   - Click "Register application"

2. **Get Credentials**
   - Copy "Client ID" (e.g., `Iv1.abc123...`)
   - Click "Generate a new client secret"
   - Copy and save "Client Secret" (shown only once)

3. **For Production Deployment**
   - Create a separate OAuth app with:
     - Homepage URL: `https://your-app.vercel.app`
     - Callback URL: `https://your-app.vercel.app/api/auth/callback/github`

## Part 2: Local Development Setup

### 2.1 Clone and Install

```bash
# Clone repository
git clone <your-repo-url>
cd FlowSight.AI

# Install dependencies (this may take 2-3 minutes)
pnpm install
```

### 2.2 Configure Dashboard Environment

```bash
cd apps/dashboard
cp .env.local.example .env.local
```

Edit `apps/dashboard/.env.local`:

```env
# MongoDB Atlas (from step 1.1)
MONGODB_URI=mongodb+srv://flowsight-admin:YOUR_PASSWORD@flowsight-cluster.xxxxx.mongodb.net/flowsight?retryWrites=true&w=majority

# Pusher (from step 1.2)
PUSHER_APP_ID=1234567
PUSHER_KEY=abcdef123456
PUSHER_SECRET=secret123456
PUSHER_CLUSTER=us2

# Public Pusher keys (same as PUSHER_KEY and PUSHER_CLUSTER)
NEXT_PUBLIC_PUSHER_KEY=abcdef123456
NEXT_PUBLIC_PUSHER_CLUSTER=us2

# NextAuth
NEXTAUTH_URL=http://localhost:3000
# Generate secret with: openssl rand -base64 32
NEXTAUTH_SECRET=your_generated_secret_here

# GitHub OAuth (from step 1.3)
GITHUB_ID=Iv1.abc123...
GITHUB_SECRET=ghp_secret123...

# API (generate random string)
API_SECRET_KEY=any_random_secret_for_internal_use
```

### 2.3 Build Shared Package

```bash
# From project root
cd packages/shared
pnpm build
```

### 2.4 Initialize MongoDB Collections (Optional)

You can create sample data by running this script in MongoDB Compass or Atlas UI:

```javascript
// Switch to flowsight database
use flowsight

// Create a default project
db.projects.insertOne({
  projectId: "default",
  name: "Default Project",
  description: "Auto-created default project",
  teamMembers: [],
  createdAt: new Date(),
  settings: {
    autoUpdateJira: true,
    blockDetectionThreshold: 0.7,
    pusherChannelName: "project:default"
  }
});

// Create a test user
db.users.insertOne({
  userId: "test@example.com",
  email: "test@example.com",
  name: "Test Developer",
  role: "dev",
  projectIds: ["default"],
  createdAt: new Date()
});

// Create sample tickets
db.tickets.insertMany([
  {
    ticketId: "FE-123",
    projectId: "default",
    title: "Build Dashboard UI",
    status: "in_progress",
    progress: 45,
    assignedTo: "test@example.com",
    lastUpdatedBy: "test@example.com",
    lastUpdatedAt: new Date(),
    createdAt: new Date()
  },
  {
    ticketId: "BE-456",
    projectId: "default",
    title: "Implement API Routes",
    status: "todo",
    progress: 0,
    lastUpdatedBy: "system",
    lastUpdatedAt: new Date(),
    createdAt: new Date()
  }
]);
```

## Part 3: Running the Application

### 3.1 Start Dashboard

```bash
cd apps/dashboard
pnpm dev
```

**Expected Output:**
```
  ▲ Next.js 15.0.0
  - Local:        http://localhost:3000
  - Network:      http://192.168.1.x:3000

 ✓ Ready in 2.3s
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3.2 Start Agent (Separate Terminal)

```bash
cd apps/agent
pnpm dev
```

**Expected Output:**
```
[electron-vite] dev server running
[electron] Electron started
```

The agent window will open.

### 3.3 Configure Agent

In the agent window:

1. **API URL**: `http://localhost:3000`
2. **API Key**: Generate one in this format: `fsa_` + 48 random alphanumeric characters
   - Example: `fsa_Abc123Def456Ghi789Jkl012Mno345Pqr678Stu901Vwx`
   - You can generate one at [random.org/strings](https://www.random.org/strings/)
3. **Developer ID**: Your email (e.g., `test@example.com`)
4. **Capture Interval**: `30` seconds
5. **Enable Screen Capture**: ✓ (optional)
6. **Enable OCR**: ✓ (optional)
7. **Enable Activity Detection**: ✓

Click **Save Config**, then **Start Monitoring**

### 3.4 Test with Simulated Events

In the agent window, scroll to "Dev Mode - Simulate Events":

1. Click **💻 Coding** - Simulates coding activity
2. Watch dashboard update in real-time
3. Click **🌐 Browsing** - Simulates browsing
4. Click **🧪 Testing** - Simulates testing
5. Click **⌨️ Terminal** - Simulates terminal usage

**You should see:**
- Dashboard updates within 1 second
- New events in Timeline
- Developer status changes
- Ticket status updates (if ticket IDs match)

## Part 4: Verify Everything Works

### 4.1 Check Dashboard

- [ ] Dashboard loads without errors
- [ ] Project Stats show data
- [ ] Team Activity shows your developer
- [ ] Activity Timeline shows simulated events
- [ ] Real-time updates work (<1s latency)

### 4.2 Check Agent

- [ ] Agent status shows "Running"
- [ ] Events Sent counter increases
- [ ] Last Activity timestamp updates
- [ ] No errors in agent window

### 4.3 Check MongoDB

1. Go to MongoDB Atlas
2. Click "Browse Collections"
3. Database: `flowsight`
4. Collections should have data:
   - `events`: Your simulated events
   - `tickets`: Created/updated tickets
   - `projects`: Default project
   - `users`: OAuth users (after first login)

### 4.4 Check Pusher

1. Go to Pusher dashboard
2. Click your app
3. Go to "Debug Console"
4. You should see messages being sent
5. Channels: `project:default`, `dev:test@example.com`

## Part 5: Production Deployment

### 5.1 Deploy Dashboard to Vercel

```bash
cd apps/dashboard

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Follow prompts:
- Set up and deploy: Yes
- Scope: Your account
- Link to existing project: No
- Project name: `flowsight-ai`
- Directory: `./` (current)
- Override settings: No
- Deploy: Yes

### 5.2 Add Environment Variables to Vercel

In Vercel dashboard:

1. Go to your project
2. Settings → Environment Variables
3. Add all variables from `.env.local`:
   - `MONGODB_URI`
   - `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`
   - `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`
   - `NEXTAUTH_URL` (use your Vercel URL: `https://your-app.vercel.app`)
   - `NEXTAUTH_SECRET`
   - `GITHUB_ID`, `GITHUB_SECRET` (use production OAuth app)
   - `API_SECRET_KEY`
4. Click "Save"
5. Redeploy: Deployments → Three dots → Redeploy

### 5.3 Update Agent Configuration

In the agent:
1. Update API URL to your Vercel URL: `https://your-app.vercel.app`
2. Keep the same API Key
3. Save and restart monitoring

### 5.4 Build Agent for Distribution

```bash
cd apps/agent

# Build production version
pnpm build

# Create installer
pnpm package
```

Installers will be in `apps/agent/dist-electron/`:
- **Mac**: `.dmg` file
- **Windows**: `.exe` file
- **Linux**: `.AppImage` file

Distribute to your team!

## Troubleshooting

### Problem: Dashboard shows "Failed to fetch"

**Solution:**
1. Check MongoDB URI is correct
2. Verify IP whitelist in MongoDB Atlas (0.0.0.0/0 for dev)
3. Check MongoDB user has correct permissions

### Problem: No real-time updates

**Solution:**
1. Check Pusher credentials in `.env.local`
2. Verify `NEXT_PUBLIC_*` variables are set
3. Open browser console, look for Pusher connection errors
4. Check Pusher dashboard for API usage

### Problem: Agent can't send events

**Solution:**
1. Verify API URL in agent config
2. Check API Key format (`fsa_...`)
3. Ensure dashboard is running
4. Check network connectivity

### Problem: NextAuth errors

**Solution:**
1. Generate new `NEXTAUTH_SECRET`: `openssl rand -base64 32`
2. Verify GitHub OAuth credentials
3. Check callback URL matches exactly

## Next Steps

1. **Invite Team Members**
   - Share agent installer
   - Provide API URL and API keys
   - Add users to MongoDB

2. **Create Real Tickets**
   - Use POST `/api/tickets` endpoint
   - Or add directly in MongoDB

3. **Customize Rules Engine**
   - Edit `apps/dashboard/src/lib/rules-engine.ts`
   - Add your own conditions and actions

4. **Set Up Monitoring**
   - Vercel Analytics
   - MongoDB Atlas Monitoring
   - Pusher Debug Console

## Support

If you encounter issues not covered here:

1. Check `README.md` for general info
2. Check `ARCHITECTURE.md` for technical details
3. Open an issue on GitHub
4. Email support@flowsight.ai

---

**Setup Complete! 🎉**

You now have a fully functional FlowSight AI installation. Happy monitoring!

