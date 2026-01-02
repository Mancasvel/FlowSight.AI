import { invoke } from '@tauri-apps/api/core';
import { AgentConfig } from '@flowsight/shared';

// Expose protected methods to renderer process
(window as any).electronAPI = {
  getConfig: () => invoke('get_config'),
  updateConfig: (config: Partial<AgentConfig>) => invoke('update_config', { config }),
  startMonitoring: () => invoke('start_monitoring'),
  stopMonitoring: () => invoke('stop_monitoring'),
  getStatus: () => invoke('get_status'),
  simulateEvent: (eventType: string) => invoke('simulate_event', { eventType }),
};

// Type declarations for window object
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<AgentConfig>;
      updateConfig: (config: Partial<AgentConfig>) => Promise<{ success: boolean }>;
      startMonitoring: () => Promise<{ success: boolean }>;
      stopMonitoring: () => Promise<{ success: boolean }>;
      getStatus: () => Promise<{
        isRunning: boolean;
        lastEventTime: Date | null;
        eventCount: number;
      }>;
      simulateEvent: (eventType: string) => Promise<{ success: boolean; event: any }>;
    };
  }
}

