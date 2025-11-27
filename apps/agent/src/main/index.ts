import { app, BrowserWindow, Menu, ipcMain, dialog } from 'electron';
import path from 'path';
import { ActivityMonitor } from '../core/ActivityMonitor';
import { BlockerDetector } from '../core/BlockerDetector';
import { EventStore } from '../core/EventStore';
import { DashboardServer } from '../dashboard/DashboardServer';
import { PrivacyManager } from '../config/privacy';
import { CloudSync } from '../sync/CloudSync';

class FlowSightAgent {
  private mainWindow: BrowserWindow | null = null;
  private dashboardServer: DashboardServer | null = null;
  private activityMonitor: ActivityMonitor | null = null;
  private blockerDetector: BlockerDetector | null = null;
  private eventStore: EventStore | null = null;
  private privacyManager: PrivacyManager | null = null;
  private cloudSync: CloudSync | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      // Initialize privacy manager first
      this.privacyManager = new PrivacyManager();
      await this.privacyManager.loadConfig();

      // Initialize core components
      this.eventStore = new EventStore();
      this.activityMonitor = new ActivityMonitor();
      this.blockerDetector = new BlockerDetector(this.privacyManager);

      // Initialize cloud sync (optional)
      this.cloudSync = new CloudSync(this.privacyManager);

      // Initialize AI components
      await this.blockerDetector.initialize();
      await this.cloudSync.initialize();

      // Setup IPC handlers
      this.setupIPCHandlers();

      // Setup activity monitoring
      this.setupActivityMonitoring();

      // Setup app event handlers
      this.setupAppEvents();

      this.isInitialized = true;
      console.log('FlowSight Agent initialized successfully');

    } catch (error) {
      console.error('Failed to initialize FlowSight Agent:', error);
      dialog.showErrorBox(
        'FlowSight Initialization Error',
        `Failed to start FlowSight Agent: ${error.message}`
      );
      app.quit();
    }
  }

  private setupIPCHandlers(): void {
    // Activity stats
    ipcMain.handle('activity:stats', async () => {
      return this.activityMonitor?.getStats();
    });

    // Blocker operations
    ipcMain.handle('blockers:get', async () => {
      return this.blockerDetector?.getBlockers();
    });

    ipcMain.handle('blockers:resolve', async (event, blockerId: string, action?: string) => {
      this.blockerDetector?.resolveBlocker(blockerId, action);
      return true;
    });

    // Privacy settings
    ipcMain.handle('privacy:get', async () => {
      return this.privacyManager?.getConfig();
    });

    ipcMain.handle('privacy:update', async (event, updates: any) => {
      this.privacyManager?.updateConfig(updates);
      return this.privacyManager?.getConfig();
    });

    // Event store queries
    ipcMain.handle('events:get', async (event, limit: number = 100) => {
      return this.eventStore?.getRecent(limit);
    });

    ipcMain.handle('stats:get', async () => {
      return {
        blockers: this.blockerDetector?.getBlockerStats(),
        session: this.eventStore?.getSessionStats(),
        activity: this.activityMonitor?.getStats(),
      };
    });

    // Manual blocker detection trigger
    ipcMain.handle('detect:blockers', async () => {
      if (this.activityMonitor && this.blockerDetector) {
        const stats = this.activityMonitor.getStats();
        return await this.blockerDetector.detect({
          windowName: 'Manual Check',
          activityDuration: stats.uptime,
        });
      }
      return null;
    });
  }

  private setupActivityMonitoring(): void {
    if (!this.activityMonitor || !this.blockerDetector) return;

    // Monitor window changes
    this.activityMonitor.on('windowChanged', async (event) => {
      this.eventStore?.add({
        type: 'window_changed',
        data: event,
      });

      // Trigger blocker detection on window change
      const blocker = await this.blockerDetector.detect({
        windowName: event.process || 'Unknown',
        activityDuration: 0, // Will be calculated internally
      });

      if (blocker) {
        console.log('Blocker detected:', blocker.description);
      }
    });

    // Monitor idle periods
    this.activityMonitor.on('idleDetected', (event) => {
      this.eventStore?.add({
        type: 'idle_detected',
        data: event,
      });
    });
  }

  private setupAppEvents(): void {
    app.on('ready', async () => {
      await this.createDashboard();
      this.createMenu();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.cleanup();
        app.quit();
      }
    });

    app.on('activate', () => {
      if (this.mainWindow === null) {
        this.createDashboard();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });
  }

  private async createDashboard(): Promise<void> {
    if (!this.blockerDetector || !this.eventStore || !this.activityMonitor || !this.privacyManager) {
      throw new Error('Core components not initialized');
    }

    // Start dashboard server
    this.dashboardServer = new DashboardServer(
      this.blockerDetector,
      this.eventStore,
      this.activityMonitor,
      this.privacyManager,
      3000
    );

    await this.dashboardServer.start();

    // Create main window
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.js'),
      },
      title: 'FlowSight AI - Developer Productivity Agent',
      show: false, // Don't show until ready
    });

    // Load dashboard
    this.mainWindow.loadURL('http://localhost:3000');

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });

    // Handle window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }
  }

  private createMenu(): void {
    const template: any = [
      {
        label: 'FlowSight',
        submenu: [
          {
            label: 'Dashboard',
            accelerator: 'CmdOrCtrl+D',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.focus();
              } else {
                this.createDashboard();
              }
            },
          },
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => {
              // Open settings dialog or navigate to settings page
              this.mainWindow?.webContents.send('navigate', '/settings');
            },
          },
          { type: 'separator' },
          {
            label: 'Check for Blockers',
            accelerator: 'CmdOrCtrl+B',
            click: () => {
              // Trigger manual blocker detection
              this.mainWindow?.webContents.send('manual-check');
            },
          },
          { type: 'separator' },
          { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
        ],
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Documentation',
            click: () => {
              // Open documentation
              require('electron').shell.openExternal('https://docs.flowsight.ai');
            },
          },
          {
            label: 'Privacy Policy',
            click: () => {
              require('electron').shell.openExternal('https://flowsight.ai/privacy');
            },
          },
          { type: 'separator' },
          {
            label: 'About FlowSight',
            click: () => {
              dialog.showMessageBox(this.mainWindow!, {
                type: 'info',
                title: 'About FlowSight AI',
                message: 'FlowSight AI v1.0.0',
                detail: 'Privacy-first, local-first developer productivity agent.\n\nAll processing happens locally on your machine.',
              });
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private cleanup(): void {
    try {
      this.activityMonitor?.destroy();
      this.dashboardServer?.stop();
      this.eventStore?.close();
      console.log('FlowSight Agent cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  public getStatus(): {
    initialized: boolean;
    dashboardPort?: number;
    connectedClients?: number;
    blockersCount?: number;
  } {
    return {
      initialized: this.isInitialized,
      dashboardPort: this.dashboardServer?.getPort(),
      connectedClients: this.dashboardServer?.getConnectedClients(),
      blockersCount: this.blockerDetector?.getBlockers().length,
    };
  }
}

// Initialize the agent
new FlowSightAgent();