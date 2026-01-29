import { ActivityMonitor } from '../core/ActivityMonitor';
import { BlockerDetector } from '../core/BlockerDetector';
import { EventStore } from '../core/EventStore';
import { DashboardServer } from '../dashboard/DashboardServer';
import { PrivacyManager } from '../config/privacy';
import { CloudSync } from '../sync/CloudSync';
import { AgentConfig } from '@flowsight/shared';

class FlowSightAgent {
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

      // Setup activity monitoring
      this.setupActivityMonitoring();

      this.isInitialized = true;
      console.log('FlowSight Agent initialized successfully');

    } catch (error) {
      console.error('Failed to initialize FlowSight Agent:', error);
      throw error;
    }
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

  // IPC-like methods for Tauri commands
  async getConfig(): Promise<AgentConfig> {
    return this.privacyManager?.getConfig() || {} as AgentConfig;
  }

  async updateConfig(updates: Partial<AgentConfig>): Promise<AgentConfig> {
    this.privacyManager?.updateConfig(updates);
    return this.privacyManager?.getConfig() || {} as AgentConfig;
  }

  async startMonitoring(): Promise<{ success: boolean }> {
    if (this.activityMonitor) {
      this.activityMonitor.start();
      return { success: true };
    }
    return { success: false };
  }

  async stopMonitoring(): Promise<{ success: boolean }> {
    if (this.activityMonitor) {
      this.activityMonitor.destroy();
      return { success: true };
    }
    return { success: false };
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    lastEventTime: Date | null;
    eventCount: number;
  }> {
    const isRunning = this.activityMonitor?.isRunning() || false;
    const stats = this.activityMonitor?.getStats();
    return {
      isRunning,
      lastEventTime: stats?.lastActivity || null,
      eventCount: stats?.totalEvents || 0,
    };
  }

  async simulateEvent(eventType: string): Promise<{ success: boolean; event: any }> {
    // This would simulate different types of events
    console.log('Simulating event:', eventType);
    return { success: true, event: { type: eventType, simulated: true } };
  }

  async getBlockers(): Promise<any[]> {
    return this.blockerDetector?.getBlockers() || [];
  }

  async resolveBlocker(blockerId: string, action?: string): Promise<boolean> {
    this.blockerDetector?.resolveBlocker(blockerId, action);
    return true;
  }

  async getBlockerStats(): Promise<any> {
    return this.blockerDetector?.getBlockerStats() || {};
  }

  async getRecentEvents(limit: number = 100): Promise<any[]> {
    return this.eventStore?.getRecent(limit) || [];
  }

  async getSessionStats(): Promise<any> {
    return this.eventStore?.getSessionStats() || {};
  }

  async getActivityStats(): Promise<any> {
    return this.activityMonitor?.getStats() || {};
  }

  async detectBlockers(): Promise<any> {
    if (this.activityMonitor && this.blockerDetector) {
      const stats = this.activityMonitor.getStats();
      return await this.blockerDetector.detect({
        windowName: 'Manual Check',
        activityDuration: stats.uptime,
      });
    }
    return null;
  }

  getStatusSummary(): {
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

  cleanup(): void {
    try {
      this.activityMonitor?.destroy();
      this.dashboardServer?.stop();
      this.eventStore?.close();
      console.log('FlowSight Agent cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Create a singleton instance
let agentInstance: FlowSightAgent | null = null;

export function getAgent(): FlowSightAgent {
  if (!agentInstance) {
    agentInstance = new FlowSightAgent();
  }
  return agentInstance;
}

export { FlowSightAgent };


