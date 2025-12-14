import { BrowserWindow, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import os from 'os';

interface ActivityEvent {
  timestamp: number;
  type: 'window_change' | 'focus_change' | 'input' | 'idle';
  windowName?: string;
  process?: string;
  focusDuration?: number;
  isIdle: boolean;
  idleTime?: number;
}

export class ActivityMonitor extends EventEmitter {
  private lastActivity: number = Date.now();
  private currentWindow: string = '';
  private idleThreshold: number = 30000; // 30 seconds
  private monitoringInterval: NodeJS.Timer | null = null;

  constructor() {
    super();
    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    // Platform-specific: use native modules to track window focus without privacy issues
    if (process.platform === 'darwin') {
      this.monitorMacOS();
    } else if (process.platform === 'win32') {
      this.monitorWindows();
    } else if (process.platform === 'linux') {
      this.monitorLinux();
    }

    // Check idle every 5 seconds locally
    this.monitoringInterval = setInterval(() => {
      this.checkIdle();
    }, 5000);
  }

  private monitorMacOS(): void {
    // Use osascript or native Swift bridge to get active window (no permission issues)
    const { execSync } = require('child_process');
    setInterval(() => {
      try {
        const activeApp = execSync(
          `osascript -e 'tell application "System Events" to name of first application process whose frontmost is true'`,
          { encoding: 'utf8' }
        ).trim();

        if (activeApp !== this.currentWindow) {
          this.currentWindow = activeApp;
          this.emit('windowChanged', {
            timestamp: Date.now(),
            type: 'window_change',
            process: activeApp,
          } as ActivityEvent);
        }
      } catch (e) {
        // Silent fail, continue monitoring
      }
    }, 2000);
  }

  private monitorWindows(): void {
    // Use Windows API via ffi-napi or native module
    // Alternative: Hook into Electron's native event loop
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win: any) => {
      win.on('focus', () => {
        this.onActivityDetected('focus_change');
      });
    });
  }

  private monitorLinux(): void {
    // Use X11 or Wayland via xdotool fallback
    const { execSync } = require('child_process');
    setInterval(() => {
      try {
        const activeWindow = execSync('xdotool getactivewindow getwindowname').toString().trim();
        if (activeWindow !== this.currentWindow) {
          this.currentWindow = activeWindow;
          this.emit('windowChanged', {
            timestamp: Date.now(),
            type: 'window_change',
            windowName: activeWindow,
          } as ActivityEvent);
        }
      } catch (e) {
        // Fallback if xdotool not available
      }
    }, 2000);
  }

  private checkIdle(): void {
    const now = Date.now();
    const idleTime = now - this.lastActivity;

    if (idleTime > this.idleThreshold) {
      this.emit('idleDetected', {
        timestamp: now,
        type: 'idle',
        isIdle: true,
        idleTime,
      } as ActivityEvent);
    }
  }

  public onActivityDetected(type: string): void {
    this.lastActivity = Date.now();
    this.emit('activity', {
      timestamp: Date.now(),
      type: type as any,
      isIdle: false,
    } as ActivityEvent);
  }

  public getStats(): { uptime: number; idle: boolean; idleTime: number } {
    const now = Date.now();
    const idleTime = now - this.lastActivity;
    return {
      uptime: process.uptime() * 1000,
      idle: idleTime > this.idleThreshold,
      idleTime,
    };
  }

  public destroy(): void {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    this.removeAllListeners();
  }
}

// Exposed to renderer via IPC
ipcMain.handle('activity:stats', async () => {
  // Return to renderer for UI
});




