interface BlockerPattern {
  id: string;
  name: string;
  type: 'build_error' | 'timeout' | 'circular_dep' | 'permission' | 'resource';
  signals: string[];
  confidence: number; // 0.5-1.0
  requiredDuration: number; // ms
  autoResolveAction?: string;
}

export class RulesEngine {
  private patterns: BlockerPattern[] = [
    {
      id: 'build-error-red',
      name: 'Build Error - Red Console',
      type: 'build_error',
      signals: ['red text in console', 'error:', 'failed', 'exception'],
      confidence: 0.95,
      requiredDuration: 3000,
    },
    {
      id: 'timeout-spinner',
      name: 'Timeout - Long Running Process',
      type: 'timeout',
      signals: ['loading spinner > 60s', 'process stuck', 'no console output'],
      confidence: 0.85,
      requiredDuration: 60000,
    },
    {
      id: 'circular-dependency',
      name: 'Circular Dependency Detected',
      type: 'circular_dep',
      signals: ['circular reference', 'cyclic', 'cannot find', 'module not found'],
      confidence: 0.90,
      requiredDuration: 2000,
    },
    {
      id: 'permission-denied',
      name: 'Permission Error',
      type: 'permission',
      signals: ['permission denied', 'access denied', 'unauthorized', 'forbidden'],
      confidence: 0.92,
      requiredDuration: 1000,
    },
    {
      id: 'out-of-memory',
      name: 'Out of Memory Error',
      type: 'resource',
      signals: ['out of memory', 'heap space', 'memory limit exceeded', 'java.lang.OutOfMemoryError'],
      confidence: 0.88,
      requiredDuration: 5000,
    },
    {
      id: 'network-timeout',
      name: 'Network Timeout',
      type: 'timeout',
      signals: ['timeout', 'connection refused', 'network error', 'ECONNREFUSED'],
      confidence: 0.80,
      requiredDuration: 10000,
    },
    {
      id: 'disk-full',
      name: 'Disk Full Error',
      type: 'resource',
      signals: ['no space left', 'disk full', 'insufficient storage', 'ENOSPC'],
      confidence: 0.95,
      requiredDuration: 1000,
    },
    {
      id: 'compilation-error',
      name: 'Compilation Error',
      type: 'build_error',
      signals: ['compilation failed', 'syntax error', 'type error', 'cannot compile'],
      confidence: 0.90,
      requiredDuration: 2000,
    }
  ];

  public detectBlocker(
    ocrText: string,
    activityDuration: number,
    windowFocus: string
  ): { detected: boolean; blocker?: BlockerPattern; confidence: number } {
    const lowerText = ocrText.toLowerCase();
    const lowerWindow = windowFocus.toLowerCase();

    for (const pattern of this.patterns) {
      // Check if any signal matches
      const signalMatches = pattern.signals.filter(signal =>
        lowerText.includes(signal.toLowerCase())
      );

      // Boost confidence for development-focused windows
      let windowMultiplier = 1.0;
      if (lowerWindow.includes('terminal') || lowerWindow.includes('console') ||
          lowerWindow.includes('vscode') || lowerWindow.includes('intellij') ||
          lowerWindow.includes('webstorm') || lowerWindow.includes('sublime')) {
        windowMultiplier = 1.2;
      }

      if (signalMatches.length > 0 && activityDuration >= pattern.requiredDuration) {
        const adjustedConfidence = Math.min(pattern.confidence * windowMultiplier *
          (signalMatches.length / pattern.signals.length), 1.0);

        return {
          detected: true,
          blocker: pattern,
          confidence: adjustedConfidence,
        };
      }
    }

    return { detected: false, confidence: 0 };
  }

  public addCustomPattern(pattern: BlockerPattern): void {
    this.patterns.push(pattern);
  }

  public getPatterns(): BlockerPattern[] {
    return [...this.patterns];
  }

  public removePattern(patternId: string): boolean {
    const index = this.patterns.findIndex(p => p.id === patternId);
    if (index > -1) {
      this.patterns.splice(index, 1);
      return true;
    }
    return false;
  }

  public updatePattern(patternId: string, updates: Partial<BlockerPattern>): boolean {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      Object.assign(pattern, updates);
      return true;
    }
    return false;
  }
}
