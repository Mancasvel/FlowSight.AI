import { app, BrowserWindow, ipcMain, Menu, Tray } from 'electron';
import { join } from 'path';
import { ActivityMonitor } from './services/ActivityMonitor';
import { ConfigManager } from './services/ConfigManager';
import { EventSender } from './services/EventSender';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let activityMonitor: ActivityMonitor | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'FlowSight Agent',
    icon: join(__dirname, '../../resources/icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  // In production, use proper icon path
  tray = new Tray(join(__dirname, '../../resources/icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Start Monitoring',
      click: () => {
        activityMonitor?.start();
      },
    },
    {
      label: 'Stop Monitoring',
      click: () => {
        activityMonitor?.stop();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('FlowSight Agent');

  tray.on('click', () => {
    mainWindow?.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  const configManager = new ConfigManager();
  const eventSender = new EventSender(configManager);
  activityMonitor = new ActivityMonitor(configManager, eventSender);

  // IPC Handlers
  ipcMain.handle('get-config', async () => {
    return configManager.getConfig();
  });

  ipcMain.handle('update-config', async (_event, config) => {
    configManager.updateConfig(config);
    return { success: true };
  });

  ipcMain.handle('start-monitoring', async () => {
    activityMonitor?.start();
    return { success: true };
  });

  ipcMain.handle('stop-monitoring', async () => {
    activityMonitor?.stop();
    return { success: true };
  });

  ipcMain.handle('get-status', async () => {
    return {
      isRunning: activityMonitor?.isRunning() || false,
      lastEventTime: activityMonitor?.getLastEventTime(),
      eventCount: activityMonitor?.getEventCount() || 0,
    };
  });

  ipcMain.handle('simulate-event', async (_event, eventType) => {
    return activityMonitor?.simulateEvent(eventType);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  activityMonitor?.stop();
});

