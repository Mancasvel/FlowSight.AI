import { describe, it, expect, beforeEach } from 'vitest';
import { RulesEngine } from '../../apps/agent/src/ml/RulesEngine';

describe('RulesEngine', () => {
  let rulesEngine: RulesEngine;

  beforeEach(() => {
    rulesEngine = new RulesEngine();
  });

  it('should detect build error from red console text', () => {
    const result = rulesEngine.detectBlocker(
      'Error: Compilation failed with red text in console',
      5000,
      'VS Code'
    );

    expect(result.detected).toBe(true);
    expect(result.blocker?.type).toBe('build_error');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should detect timeout from long running process', () => {
    const result = rulesEngine.detectBlocker(
      'Process has been running for over 60 seconds',
      65000,
      'Terminal'
    );

    expect(result.detected).toBe(true);
    expect(result.blocker?.type).toBe('timeout');
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('should detect circular dependency', () => {
    const result = rulesEngine.detectBlocker(
      'Circular reference detected in module imports',
      3000,
      'VS Code'
    );

    expect(result.detected).toBe(true);
    expect(result.blocker?.type).toBe('circular_dep');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should detect permission error', () => {
    const result = rulesEngine.detectBlocker(
      'Permission denied: access forbidden',
      2000,
      'Terminal'
    );

    expect(result.detected).toBe(true);
    expect(result.blocker?.type).toBe('permission');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should return no detection for normal activity', () => {
    const result = rulesEngine.detectBlocker(
      'Successfully compiled application',
      1000,
      'VS Code'
    );

    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('should not detect blocker if duration is too short', () => {
    const result = rulesEngine.detectBlocker(
      'Error: Compilation failed',
      500, // Too short
      'VS Code'
    );

    expect(result.detected).toBe(false);
  });

  it('should allow adding custom patterns', () => {
    const customPattern = {
      id: 'custom-test',
      name: 'Custom Test Error',
      type: 'build_error' as const,
      signals: ['custom error message'],
      confidence: 0.9,
      requiredDuration: 1000,
    };

    rulesEngine.addCustomPattern(customPattern);

    const result = rulesEngine.detectBlocker(
      'Custom error message detected',
      2000,
      'IDE'
    );

    expect(result.detected).toBe(true);
    expect(result.blocker?.id).toBe('custom-test');
  });

  it('should return all patterns', () => {
    const patterns = rulesEngine.getPatterns();
    expect(patterns.length).toBeGreaterThan(5); // Default patterns
    expect(patterns[0]).toHaveProperty('id');
    expect(patterns[0]).toHaveProperty('name');
    expect(patterns[0]).toHaveProperty('type');
  });
});
