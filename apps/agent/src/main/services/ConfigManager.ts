import Store from 'electron-store';
import { AgentConfig } from '@flowsight/shared';

interface StoreSchema {
  config: AgentConfig;
}

export class ConfigManager {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        config: {
          apiUrl: 'http://localhost:3000',
          apiKey: '',
          devId: '',
          captureInterval: 30000, // 30 seconds
          enableOCR: true,
          enableScreenCapture: true,
          enableActivityDetection: true,
        },
      },
    });
  }

  getConfig(): AgentConfig {
    return this.store.get('config');
  }

  updateConfig(config: Partial<AgentConfig>): void {
    const current = this.getConfig();
    this.store.set('config', { ...current, ...config });
  }

  isConfigured(): boolean {
    const config = this.getConfig();
    return !!(config.apiKey && config.devId && config.apiUrl);
  }
}

