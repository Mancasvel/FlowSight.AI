import axios from 'axios';
import { PrivacyManager } from '../config/privacy';
import { BlockerDetector, Blocker } from '../core/BlockerDetector';
import { EventStore } from '../core/EventStore';

interface CloudConfig {
  apiUrl: string;
  apiKey?: string;
  enabled: boolean;
}

/**
 * CloudSync: OPTIONAL async upload of aggregated data
 * Only runs if user explicitly enables + provides API key
 * Never sends raw screenshots or sensitive activity
 */
export class CloudSync {
  private privacyManager: PrivacyManager;
  private config: CloudConfig;
  private apiKey: string | null = null;
  private syncing: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(privacyManager: PrivacyManager, apiUrl: string = 'https://api.flowsight.dev/v1') {
    this.privacyManager = privacyManager;
    this.config = {
      apiUrl,
      enabled: false,
    };
  }

  async initialize(): Promise<void> {
    const privacyConfig = this.privacyManager.getConfig();
    if (!privacyConfig.cloudSyncEnabled || !privacyConfig.sendAnyDataToCloud) {
      return;
    }

    // Load API key from secure storage (environment variable or secure file)
    this.apiKey = process.env.FLOWSIGHT_API_KEY || this.loadApiKey();
    this.config.enabled = !!this.apiKey;

    if (this.config.enabled) {
      // Start periodic sync (every 5 minutes)
      this.syncInterval = setInterval(() => {
        this.performSync();
      }, 5 * 60 * 1000);

      console.log('Cloud sync enabled and initialized');
    }
  }

  private loadApiKey(): string | null {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const keyPath = path.join(os.homedir(), '.flowsight', '.api_key');
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8').trim();
      }
    } catch (error) {
      console.warn('Failed to load API key:', error);
    }
    return null;
  }

  async syncBlockers(blockers: Blocker[]): Promise<void> {
    if (!this.isEnabled() || this.syncing) {
      return;
    }

    this.syncing = true;

    try {
      // Send only aggregated blocker metadata, NEVER raw data
      const payload = blockers.map(b => ({
        id: b.id,
        type: b.type,
        severity: b.severity,
        confidence: b.confidence,
        timestamp: b.timestamp,
        duration: b.duration,
        resolved: b.resolved,
        // NO: screenshotPath, ocrText, raw errors, etc.
        // NO: context with sensitive information
      }));

      if (payload.length === 0) return;

      await axios.post(`${this.config.apiUrl}/blockers`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });

      console.log(`Synced ${payload.length} blockers to cloud`);
    } catch (error) {
      console.warn('Cloud sync failed (expected if offline):', error.message);
    } finally {
      this.syncing = false;
    }
  }

  async syncEvents(eventStore: EventStore): Promise<void> {
    if (!this.isEnabled() || this.syncing) {
      return;
    }

    try {
      // Get recent events (last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const events = eventStore.getByTimeRange(oneHourAgo, Date.now());

      if (events.length === 0) return;

      // Filter out sensitive events and aggregate
      const aggregatedEvents = events
        .filter(event => !this.isSensitiveEvent(event.type))
        .map(event => ({
          type: event.type,
          timestamp: event.timestamp,
          // Remove any potentially sensitive data
          data: this.sanitizeEventData(event.data),
        }));

      await axios.post(`${this.config.apiUrl}/events`, aggregatedEvents, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`Synced ${aggregatedEvents.length} events to cloud`);
    } catch (error) {
      console.warn('Event sync failed:', error.message);
    }
  }

  async syncStats(blockerStats: any, sessionStats: any): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const payload = {
        blockers: blockerStats,
        session: sessionStats,
        timestamp: Date.now(),
        clientVersion: '1.0.0',
      };

      await axios.post(`${this.config.apiUrl}/stats`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      console.log('Synced statistics to cloud');
    } catch (error) {
      console.warn('Stats sync failed:', error.message);
    }
  }

  private isSensitiveEvent(eventType: string): boolean {
    const sensitiveTypes = [
      'window_changed', // May contain app names
      'activity_detected', // May contain sensitive activity
    ];
    return sensitiveTypes.includes(eventType);
  }

  private sanitizeEventData(data: any): any {
    // Remove potentially sensitive information
    const sanitized = { ...data };
    delete sanitized.windowName;
    delete sanitized.process;
    delete sanitized.appName;
    return sanitized;
  }

  private async performSync(): Promise<void> {
    // This would be called with actual data from the main agent
    // For now, it's a placeholder for the periodic sync
  }

  isEnabled(): boolean {
    return this.config.enabled &&
           this.privacyManager.getConfig().cloudSyncEnabled &&
           this.privacyManager.getConfig().sendAnyDataToCloud;
  }

  async disableSync(): Promise<void> {
    this.config.enabled = false;
    this.apiKey = null;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Update privacy config
    this.privacyManager.updateConfig({
      cloudSyncEnabled: false,
    });

    console.log('Cloud sync disabled');
  }

  async setApiKey(apiKey: string): Promise<boolean> {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const keyDir = path.join(os.homedir(), '.flowsight');
      if (!fs.existsSync(keyDir)) {
        fs.mkdirSync(keyDir, { recursive: true });
      }

      const keyPath = path.join(keyDir, '.api_key');
      fs.writeFileSync(keyPath, apiKey, { mode: 0o600 }); // Secure permissions

      this.apiKey = apiKey;
      this.config.enabled = true;

      // Test the API key
      await axios.get(`${this.config.apiUrl}/health`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 5000,
      });

      return true;
    } catch (error) {
      console.error('Failed to set API key:', error);
      return false;
    }
  }

  getStatus(): {
    enabled: boolean;
    hasApiKey: boolean;
    lastSync?: number;
    syncInProgress: boolean;
  } {
    return {
      enabled: this.isEnabled(),
      hasApiKey: !!this.apiKey,
      syncInProgress: this.syncing,
    };
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}
