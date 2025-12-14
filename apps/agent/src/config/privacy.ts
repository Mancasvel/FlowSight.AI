export interface PrivacyConfig {
  // Core controls
  captureScreenshots: boolean; // If false, uses activity patterns only
  sendAnyDataToCloud: boolean; // Master switch
  cloudSyncEnabled: boolean;
  jiraIntegrationEnabled: boolean;
  linearIntegrationEnabled: boolean;

  // Data retention
  localDataRetentionDays: number; // Keep on-device for X days, then delete
  cloudDataRetentionDays: number;

  // Filtering
  excludedApplications: string[]; // Don't monitor these
  includeOnlyApplications: string[]; // If set, ONLY monitor these

  // Opt-in
  shareAnonymousMetrics: boolean; // For product improvement
  allowBugReporting: boolean;
}

export const defaultPrivacy: PrivacyConfig = {
  captureScreenshots: true,
  sendAnyDataToCloud: false, // Default: ZERO cloud sync
  cloudSyncEnabled: false,
  jiraIntegrationEnabled: false,
  linearIntegrationEnabled: false,
  localDataRetentionDays: 30,
  cloudDataRetentionDays: 90,
  excludedApplications: ['Slack', 'Gmail', 'Banking Apps'],
  includeOnlyApplications: [],
  shareAnonymousMetrics: false,
  allowBugReporting: true,
};

export class PrivacyManager {
  private config: PrivacyConfig = { ...defaultPrivacy };

  async loadConfig(): Promise<void> {
    // Load from ~/.flowsight/config.json
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const configPath = path.join(os.homedir(), '.flowsight', 'config.json');
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        this.config = { ...this.config, ...JSON.parse(data) };
      }
    } catch (error) {
      console.warn('Failed to load privacy config:', error);
    }
  }

  async saveConfig(): Promise<void> {
    // Save to ~/.flowsight/config.json
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      const configDir = path.join(os.homedir(), '.flowsight');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configPath = path.join(configDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save privacy config:', error);
    }
  }

  getConfig(): PrivacyConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }

  // Check if app should be monitored
  isAppAllowed(appName: string): boolean {
    if (!this.config.captureScreenshots) return false;

    if (this.config.includeOnlyApplications.length > 0) {
      return this.config.includeOnlyApplications.includes(appName);
    }

    return !this.config.excludedApplications.includes(appName);
  }
}




