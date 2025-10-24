import { z } from 'zod';

// ============================================================================
// Event Types
// ============================================================================

export const ActivityTypeSchema = z.enum([
  'coding',
  'browsing',
  'terminal',
  'meeting',
  'idle',
  'debugging',
  'testing',
  'reviewing',
]);

export type ActivityType = z.infer<typeof ActivityTypeSchema>;

export const SemanticEventSchema = z.object({
  devId: z.string(),
  timestamp: z.string().or(z.date()),
  activity: ActivityTypeSchema,
  application: z.string().optional(),
  filePath: z.string().optional(),
  gitBranch: z.string().optional(),
  gitRepo: z.string().optional(),
  ticketId: z.string().optional(),
  meta: z.record(z.any()).optional(),
});

export type SemanticEvent = z.infer<typeof SemanticEventSchema>;

export const EventResponseSchema = z.object({
  success: z.boolean(),
  eventId: z.string().optional(),
  triggeredActions: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type EventResponse = z.infer<typeof EventResponseSchema>;

// ============================================================================
// Ticket Types
// ============================================================================

export const TicketStatusSchema = z.enum([
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
]);

export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TicketSchema = z.object({
  _id: z.string().optional(),
  ticketId: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: TicketStatusSchema,
  progress: z.number().min(0).max(100),
  assignedTo: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
  lastUpdatedAt: z.string().or(z.date()),
  blockerReason: z.string().optional(),
  externalUrl: z.string().optional(),
  createdAt: z.string().or(z.date()),
});

export type Ticket = z.infer<typeof TicketSchema>;

// ============================================================================
// Developer & User Types
// ============================================================================

export const DeveloperStatusSchema = z.object({
  devId: z.string(),
  name: z.string(),
  email: z.string().optional(),
  avatar: z.string().optional(),
  currentActivity: ActivityTypeSchema.optional(),
  currentTicket: z.string().optional(),
  currentApplication: z.string().optional(),
  currentFilePath: z.string().optional(),
  gitBranch: z.string().optional(),
  lastActiveAt: z.string().or(z.date()),
  isBlocked: z.boolean(),
  blockerReason: z.string().optional(),
});

export type DeveloperStatus = z.infer<typeof DeveloperStatusSchema>;

export const UserSchema = z.object({
  _id: z.string().optional(),
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  role: z.enum(['dev', 'pm', 'admin']),
  projectIds: z.array(z.string()),
  githubId: z.string().optional(),
  createdAt: z.string().or(z.date()),
});

export type User = z.infer<typeof UserSchema>;

// ============================================================================
// Project Types
// ============================================================================

export const ProjectSchema = z.object({
  _id: z.string().optional(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  repoUrl: z.string().optional(),
  jiraUrl: z.string().optional(),
  teamMembers: z.array(z.string()),
  createdAt: z.string().or(z.date()),
  settings: z.object({
    autoUpdateJira: z.boolean(),
    blockDetectionThreshold: z.number(),
    pusherChannelName: z.string().optional(),
  }).optional(),
});

export type Project = z.infer<typeof ProjectSchema>;

// ============================================================================
// Real-time Update Types (for Pusher)
// ============================================================================

export const RealtimeUpdateSchema = z.object({
  type: z.enum(['event', 'status_change', 'ticket_update', 'dev_status']),
  payload: z.any(),
  timestamp: z.string().or(z.date()),
});

export type RealtimeUpdate = z.infer<typeof RealtimeUpdateSchema>;

// ============================================================================
// API Request/Response Types
// ============================================================================

export const GetProjectStatusResponseSchema = z.object({
  project: ProjectSchema,
  developers: z.array(DeveloperStatusSchema),
  tickets: z.array(TicketSchema),
  recentEvents: z.array(SemanticEventSchema),
});

export type GetProjectStatusResponse = z.infer<typeof GetProjectStatusResponseSchema>;

// ============================================================================
// Rules Engine Types
// ============================================================================

export interface RuleCondition {
  field: keyof SemanticEvent;
  operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt';
  value: any;
}

export interface RuleAction {
  type: 'update_ticket_status' | 'set_blocked' | 'increase_progress' | 'send_notification';
  params: Record<string, any>;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  enabled: boolean;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  apiUrl: string;
  apiKey: string;
  devId: string;
  captureInterval: number; // milliseconds
  enableOCR: boolean;
  enableScreenCapture: boolean;
  enableActivityDetection: boolean;
}

