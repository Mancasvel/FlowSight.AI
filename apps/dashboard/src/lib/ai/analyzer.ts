import { SemanticEvent } from '@flowsight/shared';
import { 
  BlockerAnalysis, 
  ProductivityAnalysis, 
  TicketAnalysis,
  AIAnalysisRequest,
  DEFAULT_AI_CONFIG,
  AIConfig,
} from './types';
import { createAIProvider, IAIProvider } from './provider';
import { getProjectsCollection } from '../mongodb';

/**
 * AI Analyzer Service
 * Performs intelligent analysis of developer activity using LLMs
 */

export class AIAnalyzer {
  private provider: IAIProvider;
  private config: AIConfig;

  constructor(config?: AIConfig) {
    this.config = config || DEFAULT_AI_CONFIG;
    this.provider = createAIProvider(this.config);
  }

  /**
   * Analyze if developer is blocked
   */
  async analyzeBlocker(events: SemanticEvent[]): Promise<BlockerAnalysis> {
    const systemPrompt = `You are an expert in developer productivity and workflow analysis.
Analyze activity patterns to detect if a developer is blocked or stuck.

Consider these blocker indicators:
- Excessive browsing/research (>60% of time)
- Repeated searches for the same error/topic
- Long periods on same file without commits
- Frequent context switching between docs and code
- Extended idle time during work hours
- Pattern of starting work but not making progress`;

    const userPrompt = `Analyze these ${events.length} developer events from the last 2 hours:

${events.slice(0, 20).map((e, i) => `
${i + 1}. Time: ${new Date(e.timestamp).toLocaleTimeString()}
   Activity: ${e.activity}
   Application: ${e.application || 'Unknown'}
   File: ${e.filePath || 'N/A'}
   Ticket: ${e.ticketId || 'None'}
`).join('\n')}

${events.length > 20 ? `... and ${events.length - 20} more events` : ''}

Activity breakdown:
${this.getActivityBreakdown(events)}

Determine:
1. Is the developer likely blocked? (true/false)
2. Confidence level (0-100)
3. Specific reason for the block
4. Category: technical, research, dependencies, unclear_requirements, or other
5. 3-5 actionable suggestions to unblock
6. Estimated impact: low, medium, or high

Respond in JSON format:
{
  "isBlocked": boolean,
  "confidence": number,
  "reason": "specific explanation",
  "category": "category_name",
  "suggestions": ["suggestion1", "suggestion2", ...],
  "estimatedImpact": "low|medium|high"
}`;

    try {
      const result = await this.provider.analyzeJSON<BlockerAnalysis>(
        userPrompt,
        systemPrompt
      );

      console.log('AI Blocker Analysis:', result);
      return result;
    } catch (error) {
      console.error('Blocker analysis failed:', error);
      // Fallback to rule-based analysis
      return this.fallbackBlockerAnalysis(events);
    }
  }

  /**
   * Analyze developer productivity
   */
  async analyzeProductivity(events: SemanticEvent[]): Promise<ProductivityAnalysis> {
    const systemPrompt = `You are an expert in measuring developer productivity and focus.
Analyze activity patterns to assess focus, deep work periods, and distractions.`;

    const userPrompt = `Analyze these developer events:

${this.formatEventsForPrompt(events)}

Determine:
1. Focus score (0-100): How focused was the developer?
2. Number of context switches between applications
3. Deep work periods: Uninterrupted coding sessions >30 minutes
4. Distractions: Meetings, browsing, interruptions
5. Key insights about productivity patterns

Respond in JSON format:
{
  "focusScore": number,
  "contextSwitches": number,
  "deepWorkPeriods": [
    {"start": "ISO timestamp", "end": "ISO timestamp", "duration": minutes}
  ],
  "distractions": [
    {"timestamp": "ISO timestamp", "type": "description", "duration": minutes}
  ],
  "insights": ["insight1", "insight2", ...]
}`;

    try {
      return await this.provider.analyzeJSON<ProductivityAnalysis>(
        userPrompt,
        systemPrompt
      );
    } catch (error) {
      console.error('Productivity analysis failed:', error);
      return this.fallbackProductivityAnalysis(events);
    }
  }

  /**
   * Analyze ticket progress
   */
  async analyzeTicket(
    events: SemanticEvent[],
    ticketId: string
  ): Promise<TicketAnalysis> {
    const ticketEvents = events.filter(e => e.ticketId === ticketId);

    const systemPrompt = `You are an expert in software project estimation and risk assessment.
Analyze developer activity on a specific ticket to estimate completion and identify risks.`;

    const userPrompt = `Analyze progress on ticket ${ticketId}:

Events: ${ticketEvents.length}
Time span: ${this.getTimeSpan(ticketEvents)}

Recent activity:
${this.formatEventsForPrompt(ticketEvents.slice(0, 15))}

Determine:
1. Estimated completion percentage (0-100)
2. Velocity: slow, normal, or fast
3. Potential risks or blockers
4. Next recommended actions
5. Time remaining estimate (hours) with confidence (0-100)

Respond in JSON format:
{
  "estimatedCompletion": number,
  "velocity": "slow|normal|fast",
  "risks": ["risk1", "risk2", ...],
  "nextActions": ["action1", "action2", ...],
  "timeEstimate": {
    "remaining": number,
    "confidence": number
  }
}`;

    try {
      return await this.provider.analyzeJSON<TicketAnalysis>(
        userPrompt,
        systemPrompt
      );
    } catch (error) {
      console.error('Ticket analysis failed:', error);
      return this.fallbackTicketAnalysis(ticketEvents);
    }
  }

  /**
   * Get project-specific AI configuration
   */
  static async getProjectConfig(projectId: string): Promise<AIConfig> {
    try {
      const projects = await getProjectsCollection();
      const project = await projects.findOne({ projectId });

      if (project?.settings?.aiConfig) {
        return project.settings.aiConfig as AIConfig;
      }

      return DEFAULT_AI_CONFIG;
    } catch (error) {
      console.error('Failed to load project AI config:', error);
      return DEFAULT_AI_CONFIG;
    }
  }

  /**
   * Helper: Get activity breakdown
   */
  private getActivityBreakdown(events: SemanticEvent[]): string {
    const breakdown = events.reduce((acc, e) => {
      acc[e.activity] = (acc[e.activity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(breakdown)
      .map(([activity, count]) => `- ${activity}: ${count} (${Math.round(count / events.length * 100)}%)`)
      .join('\n');
  }

  /**
   * Helper: Format events for prompt
   */
  private formatEventsForPrompt(events: SemanticEvent[]): string {
    return events.map((e, i) => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      return `${i + 1}. [${time}] ${e.activity} - ${e.application || 'Unknown'} ${e.ticketId ? `(${e.ticketId})` : ''}`;
    }).join('\n');
  }

  /**
   * Helper: Get time span
   */
  private getTimeSpan(events: SemanticEvent[]): string {
    if (events.length === 0) return 'No events';
    const first = new Date(events[0].timestamp);
    const last = new Date(events[events.length - 1].timestamp);
    const hours = (last.getTime() - first.getTime()) / 1000 / 60 / 60;
    return `${hours.toFixed(1)} hours`;
  }

  /**
   * Fallback: Rule-based blocker detection
   */
  private fallbackBlockerAnalysis(events: SemanticEvent[]): BlockerAnalysis {
    const browsingCount = events.filter(e => e.activity === 'browsing').length;
    const browsingRatio = browsingCount / events.length;

    const isBlocked = browsingRatio > 0.6 && events.length > 10;

    return {
      isBlocked,
      confidence: isBlocked ? 75 : 30,
      reason: isBlocked
        ? `Excessive browsing activity detected (${Math.round(browsingRatio * 100)}% of time)`
        : 'Activity patterns appear normal',
      category: 'research',
      suggestions: isBlocked
        ? [
            'Schedule a quick sync with team lead',
            'Check if documentation is available',
            'Consider pair programming session',
          ]
        : [],
      estimatedImpact: isBlocked ? 'medium' : 'low',
    };
  }

  /**
   * Fallback: Basic productivity analysis
   */
  private fallbackProductivityAnalysis(events: SemanticEvent[]): ProductivityAnalysis {
    const codingEvents = events.filter(e => e.activity === 'coding');
    const focusScore = Math.min(100, (codingEvents.length / events.length) * 150);

    return {
      focusScore: Math.round(focusScore),
      contextSwitches: this.countContextSwitches(events),
      deepWorkPeriods: [],
      distractions: [],
      insights: [
        `${codingEvents.length} coding events detected`,
        `Focus score: ${Math.round(focusScore)}/100`,
      ],
    };
  }

  /**
   * Fallback: Basic ticket analysis
   */
  private fallbackTicketAnalysis(events: SemanticEvent[]): TicketAnalysis {
    const velocity = events.length > 20 ? 'normal' : events.length > 10 ? 'slow' : 'slow';

    return {
      estimatedCompletion: Math.min(100, events.length * 2),
      velocity,
      risks: events.length < 5 ? ['Low activity detected'] : [],
      nextActions: ['Continue development', 'Commit progress'],
      timeEstimate: {
        remaining: Math.max(1, 20 - events.length / 3),
        confidence: 50,
      },
    };
  }

  /**
   * Helper: Count context switches
   */
  private countContextSwitches(events: SemanticEvent[]): number {
    let switches = 0;
    for (let i = 1; i < events.length; i++) {
      if (events[i].application !== events[i - 1].application) {
        switches++;
      }
    }
    return switches;
  }
}

/**
 * Singleton instance for default configuration
 */
let defaultAnalyzer: AIAnalyzer | null = null;

export function getAIAnalyzer(config?: AIConfig): AIAnalyzer {
  if (!config && !defaultAnalyzer) {
    defaultAnalyzer = new AIAnalyzer();
  }
  return config ? new AIAnalyzer(config) : defaultAnalyzer!;
}




