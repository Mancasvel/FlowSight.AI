import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockerDetector } from '../../apps/agent/src/core/BlockerDetector';
import { PrivacyManager } from '../../apps/agent/src/config/privacy';

// Mock dependencies
vi.mock('../../apps/agent/src/ml/RulesEngine');
vi.mock('../../apps/agent/src/ml/LLMLocal');
vi.mock('../../apps/agent/src/ml/OCRLocal');
vi.mock('../../apps/agent/src/ml/VisionLocal');
vi.mock('../../apps/agent/src/core/ScreenCapture');

describe('BlockerDetector', () => {
  let blockerDetector: BlockerDetector;
  let privacyManager: PrivacyManager;

  beforeEach(async () => {
    privacyManager = new PrivacyManager();
    blockerDetector = new BlockerDetector(privacyManager);
    await blockerDetector.initialize();
  });

  it('should initialize successfully', async () => {
    expect(blockerDetector).toBeDefined();
    // Should not throw
    await expect(blockerDetector.initialize()).resolves.not.toThrow();
  });

  it('should return empty blockers list initially', () => {
    const blockers = blockerDetector.getBlockers();
    expect(blockers).toEqual([]);
  });

  it('should return blocker stats', () => {
    const stats = blockerDetector.getBlockerStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('resolved');
    expect(stats).toHaveProperty('byType');
    expect(stats).toHaveProperty('bySeverity');
    expect(stats.total).toBe(0);
    expect(stats.resolved).toBe(0);
  });

  it('should resolve blocker correctly', () => {
    // Add a mock blocker first
    const mockBlocker = {
      id: 'test-blocker-1',
      timestamp: Date.now(),
      type: 'build_error',
      severity: 'high' as const,
      description: 'Test blocker',
      confidence: 0.9,
      signals: ['error'],
      suggestedAction: 'Fix the error',
      duration: 5000,
      resolved: false,
      context: {
        windowName: 'VS Code',
        ocrText: 'error message',
      },
    };

    // Manually add to blockers (normally done by detect method)
    (blockerDetector as any).blockers.set(mockBlocker.id, mockBlocker);

    blockerDetector.resolveBlocker(mockBlocker.id, 'User fixed it');

    const resolvedBlockers = blockerDetector.getResolvedBlockers();
    expect(resolvedBlockers).toHaveLength(1);
    expect(resolvedBlockers[0].resolved).toBe(true);
    expect(resolvedBlockers[0].suggestedAction).toBe('User fixed it');
  });

  it('should clear old blockers', () => {
    const oldTimestamp = Date.now() - (40 * 24 * 60 * 60 * 1000); // 40 days ago

    const oldBlocker = {
      id: 'old-blocker',
      timestamp: oldTimestamp,
      type: 'timeout',
      severity: 'medium' as const,
      description: 'Old blocker',
      confidence: 0.7,
      signals: ['timeout'],
      suggestedAction: 'Restart',
      duration: 30000,
      resolved: false,
      context: {
        windowName: 'Terminal',
        ocrText: 'timeout',
      },
    };

    (blockerDetector as any).blockers.set(oldBlocker.id, oldBlocker);

    const cleared = blockerDetector.clearOldBlockers(30); // Clear blockers older than 30 days
    expect(cleared).toBe(1);

    const remainingBlockers = blockerDetector.getBlockers();
    expect(remainingBlockers).toHaveLength(0);
  });

  it('should handle blocker detection with privacy disabled', async () => {
    // Mock privacy config to disable screenshots
    vi.spyOn(privacyManager, 'getConfig').mockReturnValue({
      ...privacyManager.getConfig(),
      captureScreenshots: false,
    });

    const result = await blockerDetector.detect({
      windowName: 'Test App',
      activityDuration: 5000,
    });

    expect(result).toBeNull();
  });
});




