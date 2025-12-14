import { SemanticEvent } from '@flowsight/shared';

/**
 * AI Analysis Result Types
 */

export interface BlockerAnalysis {
  isBlocked: boolean;
  confidence: number; // 0-100
  reason: string;
  category: 'technical' | 'research' | 'dependencies' | 'unclear_requirements' | 'other';
  suggestions: string[];
  estimatedImpact: 'low' | 'medium' | 'high';
}

export interface ProductivityAnalysis {
  focusScore: number; // 0-100
  contextSwitches: number;
  deepWorkPeriods: Array<{
    start: string;
    end: string;
    duration: number; // minutes
  }>;
  distractions: Array<{
    timestamp: string;
    type: string;
    duration: number;
  }>;
  insights: string[];
}

export interface TicketAnalysis {
  estimatedCompletion: number; // percentage
  velocity: 'slow' | 'normal' | 'fast';
  risks: string[];
  nextActions: string[];
  timeEstimate: {
    remaining: number; // hours
    confidence: number; // 0-100
  };
}

export interface TeamAnalysis {
  bottlenecks: Array<{
    devId: string;
    issue: string;
    impact: string;
  }>;
  collaboration: {
    score: number; // 0-100
    insights: string[];
  };
  recommendations: string[];
}

/**
 * AI Provider Configuration
 */

export type AIProvider = 'openrouter' | 'openai' | 'anthropic' | 'custom' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseURL?: string; // For custom providers
  maxTokens?: number;
  temperature?: number;
  timeout?: number; // milliseconds
}

export interface AIProviderConfig {
  default: AIConfig;
  fallback?: AIConfig;
  // Per-project overrides
  projects?: Record<string, AIConfig>;
}

/**
 * AI Analysis Request
 */

export interface AIAnalysisRequest {
  type: 'blocker' | 'productivity' | 'ticket' | 'team';
  events: SemanticEvent[];
  context?: {
    devId?: string;
    ticketId?: string;
    projectId?: string;
    timeRange?: {
      start: Date;
      end: Date;
    };
  };
}

/**
 * AI Analysis Response
 */

export type AIAnalysisResponse = 
  | BlockerAnalysis 
  | ProductivityAnalysis 
  | TicketAnalysis 
  | TeamAnalysis;

/**
 * AI Model Presets
 */

export const AI_MODELS = {
  // OpenRouter models
  'gpt-4-turbo': 'openai/gpt-4-turbo-preview',
  'gpt-4': 'openai/gpt-4',
  'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
  'claude-3-opus': 'anthropic/claude-3-opus',
  'claude-3-sonnet': 'anthropic/claude-3-sonnet',
  'claude-3-haiku': 'anthropic/claude-3-haiku',
  'llama-3-70b': 'meta-llama/llama-3-70b-instruct',
  'mixtral-8x7b': 'mistralai/mixtral-8x7b-instruct',
} as const;

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: process.env.OPENROUTER_API_KEY ? 'openrouter' : 'ollama',
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.OPENROUTER_API_KEY ? AI_MODELS['gpt-4-turbo'] : 'phi3:3.8b',
  baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434',
  maxTokens: 2000,
  temperature: 0.3,
  timeout: 30000,
};


