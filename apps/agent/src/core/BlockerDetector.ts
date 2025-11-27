import { RulesEngine } from '../ml/RulesEngine';
import { LLMLocal } from '../ml/LLMLocal';
import { OCRLocal } from '../ml/OCRLocal';
import { VisionLocal } from '../ml/VisionLocal';
import { ScreenCapture } from './ScreenCapture';
import { EventEmitter } from 'events';
import { PrivacyManager } from '../config/privacy';

export interface Blocker {
  id: string;
  timestamp: number;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  signals: string[];
  suggestedAction: string;
  duration: number;
  resolved: boolean;
  context: {
    windowName: string;
    ocrText: string;
    visionAnalysis?: any;
  };
}

export class BlockerDetector extends EventEmitter {
  private rulesEngine: RulesEngine;
  private llmLocal: LLMLocal;
  private ocrLocal: OCRLocal;
  private visionLocal: VisionLocal;
  private screenCapture: ScreenCapture;
  private privacyManager: PrivacyManager;
  private blockers: Map<string, Blocker> = new Map();
  private previousErrors: string[] = [];
  private isInitialized: boolean = false;

  constructor(privacyManager: PrivacyManager) {
    super();
    this.rulesEngine = new RulesEngine();
    this.llmLocal = new LLMLocal();
    this.ocrLocal = new OCRLocal();
    this.visionLocal = new VisionLocal();
    this.screenCapture = new ScreenCapture();
    this.privacyManager = privacyManager;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize all AI components
      await this.llmLocal.initialize();
      await this.ocrLocal.initialize();
      await this.visionLocal.initialize();

      this.isInitialized = true;
      console.log('BlockerDetector initialized successfully');
    } catch (error) {
      console.error('BlockerDetector initialization failed:', error);
      // Continue with partial initialization - some components might still work
      this.isInitialized = true;
    }
  }

  async detect(context: {
    windowName: string;
    activityDuration: number;
  }): Promise<Blocker | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const privacyConfig = this.privacyManager.getConfig();
    if (!privacyConfig.captureScreenshots) {
      return null; // Privacy setting disables screenshot analysis
    }

    try {
      // Step 1: Capture screenshot for analysis
      const captureResult = await this.screenCapture.captureForAnalysis();
      if (!captureResult) {
        return null; // Failed to capture screen
      }

      const { buffer, metadata } = captureResult;

      // Step 2: Extract text via OCR (fast, local)
      const ocrResult = await this.ocrLocal.extractText(buffer);
      const ocrText = ocrResult.text;

      // Step 3: Check deterministic rules (instant)
      const ruleDetection = this.rulesEngine.detectBlocker(
        ocrText,
        context.activityDuration,
        context.windowName
      );

      // Step 4: Analyze visually (vision model) - only if OCR confidence is low
      let visionResult = null;
      if (ocrResult.confidence < 0.7) {
        visionResult = await this.visionLocal.analyzeScreenshot(buffer);
      }

      // Step 5: Get LLM contextual analysis (local, no latency)
      const llmAnalysis = await this.llmLocal.analyzeBlocker({
        ocrText,
        windowName: context.windowName,
        activityDuration: context.activityDuration,
        previousErrors: this.previousErrors,
      });

      // Step 6: Consensus-based blocker determination
      const consensusConfidence = this.calculateConsensusConfidence(
        ruleDetection,
        visionResult,
        llmAnalysis,
        ocrResult.confidence
      );

      if (consensusConfidence > 0.5) {
        const blockerId = `blocker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const blocker: Blocker = {
          id: blockerId,
          timestamp: Date.now(),
          type: llmAnalysis.blockerType,
          severity: llmAnalysis.severity,
          description: ruleDetection.blocker?.name || llmAnalysis.blockerType.replace('_', ' ').toUpperCase(),
          confidence: consensusConfidence,
          signals: [
            ...(!ruleDetection.detected ? [] : [ruleDetection.blocker?.name || '']),
            ...(visionResult?.hasError ? ['Visual Error Detected'] : []),
            ...(visionResult?.hasStackTrace ? ['Stack Trace Visible'] : []),
            ...(visionResult?.hasLoadingIndicator ? ['Loading Indicator'] : []),
          ].filter(Boolean),
          suggestedAction: llmAnalysis.suggestedAction,
          duration: context.activityDuration,
          resolved: false,
          context: {
            windowName: context.windowName,
            ocrText: ocrText.substring(0, 200), // Limit stored text
            visionAnalysis: visionResult,
          },
        };

        this.blockers.set(blockerId, blocker);
        this.previousErrors.push(blocker.type);
        if (this.previousErrors.length > 10) this.previousErrors.shift();

        this.emit('blockerDetected', blocker);
        return blocker;
      }

      return null;
    } catch (error) {
      console.error('Blocker detection error:', error);
      return null;
    }
  }

  private calculateConsensusConfidence(
    ruleDetection: any,
    visionResult: any,
    llmAnalysis: any,
    ocrConfidence: number
  ): number {
    let totalConfidence = 0;
    let totalWeight = 0;

    // Rule-based detection (weight: 0.4)
    if (ruleDetection.detected) {
      totalConfidence += ruleDetection.confidence * 0.4;
      totalWeight += 0.4;
    }

    // Vision analysis (weight: 0.3)
    if (visionResult) {
      const visionScore = (visionResult.hasError ? 0.8 : 0) +
                         (visionResult.hasStackTrace ? 0.6 : 0) +
                         (visionResult.hasLoadingIndicator ? 0.4 : 0);
      totalConfidence += visionScore * 0.3;
      totalWeight += 0.3;
    }

    // LLM analysis (weight: 0.3)
    totalConfidence += llmAnalysis.confidence * 0.3;
    totalWeight += 0.3;

    // OCR confidence modifier (affects overall trust)
    const ocrModifier = Math.max(0.5, ocrConfidence);

    return totalWeight > 0 ? (totalConfidence / totalWeight) * ocrModifier : 0;
  }

  public getBlockers(): Blocker[] {
    return Array.from(this.blockers.values())
      .filter(b => !b.resolved)
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  public getResolvedBlockers(limit: number = 50): Blocker[] {
    return Array.from(this.blockers.values())
      .filter(b => b.resolved)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  public resolveBlocker(blockerId: string, action?: string): void {
    const blocker = this.blockers.get(blockerId);
    if (blocker) {
      blocker.resolved = true;
      if (action) {
        blocker.suggestedAction = action;
      }
      this.emit('blockerResolved', blocker);
    }
  }

  public getBlockerStats(): {
    total: number;
    resolved: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const allBlockers = Array.from(this.blockers.values());
    const resolved = allBlockers.filter(b => b.resolved).length;

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    allBlockers.forEach(blocker => {
      byType[blocker.type] = (byType[blocker.type] || 0) + 1;
      bySeverity[blocker.severity] = (bySeverity[blocker.severity] || 0) + 1;
    });

    return {
      total: allBlockers.length,
      resolved,
      byType,
      bySeverity,
    };
  }

  public clearOldBlockers(daysOld: number = 30): number {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let cleared = 0;

    for (const [id, blocker] of this.blockers.entries()) {
      if (blocker.timestamp < cutoffTime) {
        this.blockers.delete(id);
        cleared++;
      }
    }

    return cleared;
  }
}
