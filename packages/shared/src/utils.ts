import { ActivityType, SemanticEvent } from './types';

/**
 * Extract ticket ID from various sources (branch name, file path, etc.)
 */
export function extractTicketId(text: string): string | null {
  // Common patterns: PROJ-123, FE-456, BE-789, etc.
  const patterns = [
    /([A-Z]{2,10}-\d+)/i,
    /#(\d+)/,
    /ticket[_-]?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

/**
 * Detect application type from window title or process name
 */
export function detectApplication(windowTitle: string, processName: string): {
  name: string;
  category: ActivityType;
} {
  const title = windowTitle.toLowerCase();
  const process = processName.toLowerCase();

  // Code editors
  if (process.includes('code') || title.includes('visual studio code')) {
    return { name: 'VSCode', category: 'coding' };
  }
  if (process.includes('idea') || process.includes('intellij')) {
    return { name: 'IntelliJ IDEA', category: 'coding' };
  }
  if (process.includes('sublime')) {
    return { name: 'Sublime Text', category: 'coding' };
  }

  // Browsers
  if (process.includes('chrome') || process.includes('edge')) {
    if (title.includes('localhost') || title.includes('127.0.0.1')) {
      return { name: 'Chrome (Dev)', category: 'testing' };
    }
    if (title.includes('stackoverflow') || title.includes('github')) {
      return { name: 'Chrome (Research)', category: 'browsing' };
    }
    return { name: 'Chrome', category: 'browsing' };
  }

  // Terminal
  if (process.includes('terminal') || process.includes('powershell') || process.includes('cmd')) {
    return { name: 'Terminal', category: 'terminal' };
  }

  // Communication
  if (process.includes('slack') || process.includes('teams') || process.includes('zoom')) {
    return { name: processName, category: 'meeting' };
  }

  return { name: processName, category: 'idle' };
}

/**
 * Sanitize file paths to remove sensitive information
 */
export function sanitizeFilePath(filePath: string): string {
  // Remove user-specific paths
  const homeRegex = /\/Users\/[^/]+/g;
  const windowsHomeRegex = /C:\\Users\\[^\\]+/g;
  
  let sanitized = filePath.replace(homeRegex, '/Users/***');
  sanitized = sanitized.replace(windowsHomeRegex, 'C:\\Users\\***');
  
  return sanitized;
}

/**
 * Calculate time difference in minutes
 */
export function getMinutesSince(timestamp: Date | string): number {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
}

/**
 * Validate API key format
 */
export function isValidApiKey(apiKey: string): boolean {
  return /^fsa_[a-zA-Z0-9]{32,}$/.test(apiKey);
}

/**
 * Generate a unique API key
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'fsa_';
  for (let i = 0; i < 48; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Check if developer is likely blocked based on activity patterns
 */
export function detectBlocker(recentEvents: SemanticEvent[]): {
  isBlocked: boolean;
  reason?: string;
} {
  if (recentEvents.length < 5) {
    return { isBlocked: false };
  }

  // Check for repeated StackOverflow/Google searches
  const browserEvents = recentEvents.filter(e => e.activity === 'browsing');
  if (browserEvents.length > 10 && browserEvents.length / recentEvents.length > 0.7) {
    return { 
      isBlocked: true, 
      reason: 'Excessive browsing activity detected (potential research blocker)' 
    };
  }

  // Check for same file open for extended period with no progress
  const codingEvents = recentEvents.filter(e => e.activity === 'coding');
  if (codingEvents.length > 15) {
    const uniqueFiles = new Set(codingEvents.map(e => e.filePath));
    if (uniqueFiles.size === 1) {
      return { 
        isBlocked: true, 
        reason: 'Stuck on same file for extended period' 
      };
    }
  }

  return { isBlocked: false };
}

/**
 * Format time duration
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

