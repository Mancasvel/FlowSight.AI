import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { BlockerDetector } from '../core/BlockerDetector';
import { EventStore } from '../core/EventStore';
import { ActivityMonitor } from '../core/ActivityMonitor';
import { PrivacyManager } from '../config/privacy';

export class DashboardServer {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private blockerDetector: BlockerDetector;
  private eventStore: EventStore;
  private activityMonitor: ActivityMonitor;
  private privacyManager: PrivacyManager;
  private port: number;

  constructor(
    blockerDetector: BlockerDetector,
    eventStore: EventStore,
    activityMonitor: ActivityMonitor,
    privacyManager: PrivacyManager,
    port: number = 3000
  ) {
    this.port = port;
    this.blockerDetector = blockerDetector;
    this.eventStore = eventStore;
    this.activityMonitor = activityMonitor;
    this.privacyManager = privacyManager;

    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: `http://localhost:${port}`,
        methods: ['GET', 'POST'],
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.static(path.join(__dirname, '../../../dashboard/build')));

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        version: '1.0.0',
        services: {
          blockerDetector: true,
          eventStore: true,
          activityMonitor: true,
        },
      });
    });

    // Get recent blockers
    this.app.get('/api/blockers', (req, res) => {
      try {
        const blockers = this.blockerDetector.getBlockers();
        res.json({
          blockers,
          total: blockers.length,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve blockers' });
      }
    });

    // Get blocker by ID
    this.app.get('/api/blockers/:id', (req, res) => {
      try {
        const blockers = this.blockerDetector.getBlockers();
        const blocker = blockers.find(b => b.id === req.params.id);
        if (blocker) {
          res.json(blocker);
        } else {
          res.status(404).json({ error: 'Blocker not found' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve blocker' });
      }
    });

    // Resolve blocker
    this.app.post('/api/blockers/:id/resolve', (req, res) => {
      try {
        const { action } = req.body;
        this.blockerDetector.resolveBlocker(req.params.id, action);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: 'Failed to resolve blocker' });
      }
    });

    // Get events
    this.app.get('/api/events', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const events = this.eventStore.getRecent(limit);
        res.json({
          events,
          total: events.length,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve events' });
      }
    });

    // Get events by type
    this.app.get('/api/events/type/:type', (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const events = this.eventStore.getByType(req.params.type, limit);
        res.json({
          events,
          total: events.length,
          type: req.params.type,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve events by type' });
      }
    });

    // Get activity stats
    this.app.get('/api/activity/stats', (req, res) => {
      try {
        const stats = this.activityMonitor.getStats();
        res.json({
          ...stats,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve activity stats' });
      }
    });

    // Get blocker stats
    this.app.get('/api/stats/blockers', (req, res) => {
      try {
        const stats = this.blockerDetector.getBlockerStats();
        res.json({
          ...stats,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve blocker stats' });
      }
    });

    // Get session stats
    this.app.get('/api/stats/session', (req, res) => {
      try {
        const stats = this.eventStore.getSessionStats();
        res.json({
          ...stats,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve session stats' });
      }
    });

    // Privacy settings
    this.app.get('/api/privacy', (req, res) => {
      try {
        const config = this.privacyManager.getConfig();
        res.json({
          config,
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve privacy settings' });
      }
    });

    this.app.post('/api/privacy', (req, res) => {
      try {
        const updates = req.body;
        this.privacyManager.updateConfig(updates);
        res.json({
          success: true,
          config: this.privacyManager.getConfig(),
          timestamp: Date.now(),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to update privacy settings' });
      }
    });

    // Catch-all handler: serve React app
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../../../dashboard/build/index.html'));
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('Dashboard client connected:', socket.id);

      // Send initial state
      socket.emit('state', {
        blockers: this.blockerDetector.getBlockers(),
        events: this.eventStore.getRecent(50),
        stats: {
          blockers: this.blockerDetector.getBlockerStats(),
          session: this.eventStore.getSessionStats(),
          activity: this.activityMonitor.getStats(),
        },
        timestamp: Date.now(),
      });

      // Handle client requests
      socket.on('refresh', () => {
        socket.emit('state', {
          blockers: this.blockerDetector.getBlockers(),
          events: this.eventStore.getRecent(50),
          stats: {
            blockers: this.blockerDetector.getBlockerStats(),
            session: this.eventStore.getSessionStats(),
            activity: this.activityMonitor.getStats(),
          },
          timestamp: Date.now(),
        });
      });

      socket.on('get-blockers', () => {
        socket.emit('blockers', this.blockerDetector.getBlockers());
      });

      socket.on('get-events', (limit: number = 50) => {
        socket.emit('events', this.eventStore.getRecent(limit));
      });

      socket.on('disconnect', () => {
        console.log('Dashboard client disconnected:', socket.id);
      });
    });
  }

  private setupEventHandlers(): void {
    // Broadcast blocker detection to all connected dashboards
    this.blockerDetector.on('blockerDetected', (blocker) => {
      this.io.emit('blocker:new', blocker);
      this.eventStore.add({
        type: 'blocker_detected',
        data: blocker,
      });

      // Also emit general state update
      this.io.emit('state:update', {
        type: 'blocker_detected',
        data: blocker,
        timestamp: Date.now(),
      });
    });

    this.blockerDetector.on('blockerResolved', (blocker) => {
      this.io.emit('blocker:resolved', blocker);
      this.eventStore.add({
        type: 'blocker_resolved',
        data: blocker,
      });

      this.io.emit('state:update', {
        type: 'blocker_resolved',
        data: blocker,
        timestamp: Date.now(),
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`📊 FlowSight Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close();
      this.httpServer.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getConnectedClients(): number {
    return this.io.sockets.sockets.size;
  }
}




