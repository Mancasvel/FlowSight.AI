import { contextBridge, ipcRenderer } from 'electron';
import { AgentConfig } from '@flowsight/shared';

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: Partial<AgentConfig>) => ipcRenderer.invoke('update-config', config),
  startMonitoring: () => ipcRenderer.invoke('start-monitoring'),
  stopMonitoring: () => ipcRenderer.invoke('stop-monitoring'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  simulateEvent: (eventType: string) => ipcRenderer.invoke('simulate-event', eventType),
});

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

