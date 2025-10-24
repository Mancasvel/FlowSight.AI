import activeWin from 'active-win';
import screenshot from 'screenshot-desktop';
import { createWorker } from 'tesseract.js';
import { SemanticEvent, detectApplication, extractTicketId } from '@flowsight/shared';
import { ConfigManager } from './ConfigManager';
import { EventSender } from './EventSender';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export class ActivityMonitor {
  private intervalId: NodeJS.Timeout | null = null;
  private isActive = false;
  private eventCount = 0;
  private lastEventTime: Date | null = null;
  private ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

  constructor(
    private configManager: ConfigManager,
    private eventSender: EventSender
  ) {}

  async start() {
    if (this.isActive) {
      console.log('ActivityMonitor already running');
      return;
    }

    const config = this.configManager.getConfig();
    
    if (!this.configManager.isConfigured()) {
      console.error('Agent not configured. Please set API key and dev ID.');
      return;
    }

    // Initialize OCR worker if enabled
    if (config.enableOCR) {
      try {
        this.ocrWorker = await createWorker('eng', 1, {
          logger: (m) => console.log('[OCR]', m),
        });
      } catch (error) {
        console.error('Failed to initialize OCR:', error);
      }
    }

    this.isActive = true;
    console.log('ActivityMonitor started');

    // Initial capture
    await this.captureActivity();

    // Set up interval
    this.intervalId = setInterval(() => {
      this.captureActivity();
    }, config.captureInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.ocrWorker) {
      this.ocrWorker.terminate();
      this.ocrWorker = null;
    }

    this.isActive = false;
    console.log('ActivityMonitor stopped');
  }

  isRunning(): boolean {
    return this.isActive;
  }

  getLastEventTime(): Date | null {
    return this.lastEventTime;
  }

  getEventCount(): number {
    return this.eventCount;
  }

  private async captureActivity() {
    try {
      const config = this.configManager.getConfig();
      
      // Get active window information
      const windowInfo = await activeWin();
      
      if (!windowInfo) {
        console.log('No active window detected');
        return;
      }

      console.log('Active window:', windowInfo.title, windowInfo.owner.name);

      // Detect application and activity type
      const appInfo = detectApplication(windowInfo.title, windowInfo.owner.name);

      // Build semantic event
      const event: SemanticEvent = {
        devId: config.devId,
        timestamp: new Date().toISOString(),
        activity: appInfo.category,
        application: appInfo.name,
        meta: {
          windowTitle: windowInfo.title,
        },
      };

      // Extract file path and git info for VSCode
      if (appInfo.name === 'VSCode') {
        const filePathMatch = windowInfo.title.match(/(.+?)\s*[-–—]\s*Visual Studio Code/);
        if (filePathMatch) {
          event.filePath = filePathMatch[1];
          
          // Try to extract git info
          const gitInfo = await this.getGitInfo(filePathMatch[1]);
          if (gitInfo) {
            event.gitBranch = gitInfo.branch;
            event.gitRepo = gitInfo.repo;
            
            // Extract ticket ID from branch
            const ticketId = extractTicketId(gitInfo.branch);
            if (ticketId) {
              event.ticketId = ticketId;
            }
          }
        }
      }

      // OCR for ticket IDs (lightweight, only if no ticket found yet)
      if (config.enableOCR && config.enableScreenCapture && !event.ticketId && this.ocrWorker) {
        const ticketFromOCR = await this.performLightweightOCR();
        if (ticketFromOCR) {
          event.ticketId = ticketFromOCR;
        }
      }

      // Send event
      await this.eventSender.sendEvent(event);
      
      this.eventCount++;
      this.lastEventTime = new Date();
      
      console.log('Event captured and sent:', event);
    } catch (error) {
      console.error('Error capturing activity:', error);
    }
  }

  private async getGitInfo(filePath: string): Promise<{ branch: string; repo: string } | null> {
    try {
      // Get directory from file path
      const dir = path.dirname(filePath);
      
      // Get current branch
      const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: dir,
      });

      // Get repo name
      const { stdout: remote } = await execAsync('git config --get remote.origin.url', {
        cwd: dir,
      });

      const repoName = remote.trim().split('/').pop()?.replace('.git', '') || '';

      return {
        branch: branch.trim(),
        repo: repoName,
      };
    } catch (error) {
      return null;
    }
  }

  private async performLightweightOCR(): Promise<string | null> {
    try {
      // Take screenshot (this is privacy-sensitive, only process locally)
      const imgBuffer = await screenshot({ format: 'png' });

      if (!this.ocrWorker) {
        return null;
      }

      // Run OCR
      const { data } = await this.ocrWorker.recognize(imgBuffer);
      
      // Extract ticket IDs from text
      const ticketId = extractTicketId(data.text);
      
      // Don't store the image or text, only extract ticket ID
      return ticketId;
    } catch (error) {
      console.error('OCR error:', error);
      return null;
    }
  }

  // Dev mode: simulate events
  async simulateEvent(eventType: string) {
    const config = this.configManager.getConfig();
    
    const simulatedEvents: Record<string, Partial<SemanticEvent>> = {
      coding: {
        activity: 'coding',
        application: 'VSCode',
        filePath: '/Users/dev/projects/my-app/src/components/Dashboard.tsx',
        gitBranch: 'feature/FE-123-dashboard',
        ticketId: 'FE-123',
      },
      browsing: {
        activity: 'browsing',
        application: 'Chrome',
        meta: { url: 'https://stackoverflow.com/questions/...' },
      },
      testing: {
        activity: 'testing',
        application: 'Chrome (Dev)',
        meta: { url: 'http://localhost:3000' },
      },
      terminal: {
        activity: 'terminal',
        application: 'Terminal',
        gitBranch: 'feature/BE-456-api',
        ticketId: 'BE-456',
      },
    };

    const eventData = simulatedEvents[eventType] || simulatedEvents.coding;
    
    const event: SemanticEvent = {
      devId: config.devId,
      timestamp: new Date().toISOString(),
      ...eventData,
    } as SemanticEvent;

    await this.eventSender.sendEvent(event);
    
    this.eventCount++;
    this.lastEventTime = new Date();

    return { success: true, event };
  }
}

