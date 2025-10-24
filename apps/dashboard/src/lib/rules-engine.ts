import { SemanticEvent, Rule, RuleAction, extractTicketId } from '@flowsight/shared';
import { getTicketsCollection, getEventsCollection } from './mongodb';
import { triggerRealtimeUpdate } from './pusher';

/**
 * Rules Engine - Evaluates events and triggers automated actions
 */
export class RulesEngine {
  private rules: Rule[] = [];

  constructor() {
    // Initialize with default rules
    this.rules = this.getDefaultRules();
  }

  getDefaultRules(): Rule[] {
    return [
      {
        id: 'auto-in-progress',
        name: 'Auto mark In Progress',
        description: 'When developer starts coding on a ticket branch, mark it In Progress',
        conditions: [
          { field: 'activity', operator: 'equals', value: 'coding' },
          { field: 'gitBranch', operator: 'contains', value: '-' },
        ],
        actions: [
          {
            type: 'update_ticket_status',
            params: { status: 'in_progress' },
          },
        ],
        enabled: true,
      },
      {
        id: 'detect-blocker',
        name: 'Detect Blocker',
        description: 'If developer has excessive browsing activity, mark as blocked',
        conditions: [
          { field: 'activity', operator: 'equals', value: 'browsing' },
        ],
        actions: [
          {
            type: 'set_blocked',
            params: { reason: 'Excessive research activity detected' },
          },
        ],
        enabled: true,
      },
      {
        id: 'progress-on-commit',
        name: 'Increase Progress on Commit',
        description: 'When commit is detected, increase ticket progress',
        conditions: [
          { field: 'meta', operator: 'contains', value: 'commit' },
        ],
        actions: [
          {
            type: 'increase_progress',
            params: { amount: 10 },
          },
        ],
        enabled: true,
      },
    ];
  }

  /**
   * Process an event through the rules engine
   */
  async processEvent(event: SemanticEvent): Promise<string[]> {
    const triggeredActions: string[] = [];

    // Extract ticket ID if not present
    if (!event.ticketId && event.gitBranch) {
      event.ticketId = extractTicketId(event.gitBranch) || undefined;
    }

    // Evaluate each rule
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (this.evaluateConditions(event, rule.conditions)) {
        console.log(`Rule triggered: ${rule.name}`);
        
        for (const action of rule.actions) {
          try {
            await this.executeAction(event, action);
            triggeredActions.push(`${rule.name}: ${action.type}`);
          } catch (error) {
            console.error(`Failed to execute action ${action.type}:`, error);
          }
        }
      }
    }

    // Check for blocker pattern (more sophisticated)
    const blockerCheck = await this.checkForBlocker(event);
    if (blockerCheck.isBlocked) {
      triggeredActions.push(blockerCheck.action);
    }

    return triggeredActions;
  }

  /**
   * Evaluate if event matches all conditions
   */
  private evaluateConditions(event: SemanticEvent, conditions: any[]): boolean {
    return conditions.every((condition) => {
      const value = this.getEventValue(event, condition.field);
      
      switch (condition.operator) {
        case 'equals':
          return value === condition.value;
        case 'contains':
          return typeof value === 'string' && value.includes(condition.value);
        case 'matches':
          return new RegExp(condition.value).test(String(value));
        case 'gt':
          return Number(value) > Number(condition.value);
        case 'lt':
          return Number(value) < Number(condition.value);
        default:
          return false;
      }
    });
  }

  /**
   * Get value from event by field path
   */
  private getEventValue(event: SemanticEvent, field: string): any {
    if (field.includes('.')) {
      const parts = field.split('.');
      let value: any = event;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    }
    return event[field as keyof SemanticEvent];
  }

  /**
   * Execute a rule action
   */
  private async executeAction(event: SemanticEvent, action: RuleAction): Promise<void> {
    switch (action.type) {
      case 'update_ticket_status':
        await this.updateTicketStatus(event, action.params.status);
        break;
      case 'set_blocked':
        await this.setBlocked(event, action.params.reason);
        break;
      case 'increase_progress':
        await this.increaseProgress(event, action.params.amount);
        break;
      case 'send_notification':
        await this.sendNotification(event, action.params);
        break;
    }
  }

  /**
   * Update ticket status
   */
  private async updateTicketStatus(event: SemanticEvent, status: string): Promise<void> {
    if (!event.ticketId) return;

    const tickets = await getTicketsCollection();
    const result = await tickets.findOneAndUpdate(
      { ticketId: event.ticketId },
      {
        $set: {
          status,
          lastUpdatedBy: event.devId,
          lastUpdatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Trigger real-time update
    if (result) {
      await triggerRealtimeUpdate(
        `project:${result.projectId}`,
        'ticket_update',
        result
      );
    }
  }

  /**
   * Set developer as blocked
   */
  private async setBlocked(event: SemanticEvent, reason: string): Promise<void> {
    if (!event.ticketId) return;

    const tickets = await getTicketsCollection();
    await tickets.updateOne(
      { ticketId: event.ticketId },
      {
        $set: {
          status: 'blocked',
          blockerReason: reason,
          lastUpdatedBy: 'system',
          lastUpdatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Increase ticket progress
   */
  private async increaseProgress(event: SemanticEvent, amount: number): Promise<void> {
    if (!event.ticketId) return;

    const tickets = await getTicketsCollection();
    await tickets.updateOne(
      { ticketId: event.ticketId },
      {
        $inc: { progress: amount },
        $set: {
          lastUpdatedBy: event.devId,
          lastUpdatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Send notification (placeholder)
   */
  private async sendNotification(event: SemanticEvent, params: any): Promise<void> {
    console.log('Notification:', params.message, event);
    // TODO: Implement actual notification system (email, Slack, etc.)
  }

  /**
   * Check for blocker patterns
   */
  private async checkForBlocker(event: SemanticEvent): Promise<{
    isBlocked: boolean;
    action: string;
  }> {
    // Get recent events for this dev
    const events = await getEventsCollection();
    const recentEvents = await events
      .find({
        devId: event.devId,
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
      })
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    // Check for excessive browsing (>70% of recent activity)
    const browsingEvents = recentEvents.filter((e: any) => e.activity === 'browsing');
    if (recentEvents.length > 10 && browsingEvents.length / recentEvents.length > 0.7) {
      if (event.ticketId) {
        await this.setBlocked(event, 'Excessive research activity - possible blocker');
      }
      return {
        isBlocked: true,
        action: 'Blocker detected: excessive browsing',
      };
    }

    return { isBlocked: false, action: '' };
  }
}

