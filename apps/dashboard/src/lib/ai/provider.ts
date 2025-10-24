import OpenAI from 'openai';
import { AIConfig, AIProvider } from './types';

/**
 * Abstract AI Provider Interface
 * Allows switching between OpenRouter, OpenAI, Anthropic, or custom models
 */

export interface IAIProvider {
  analyze(prompt: string, systemPrompt?: string): Promise<string>;
  analyzeJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;
}

/**
 * OpenRouter Provider
 * Supports multiple models (GPT-4, Claude, Llama, etc.)
 */
export class OpenRouterProvider implements IAIProvider {
  private client: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'FlowSight AI',
      },
    });
  }

  async analyze(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          ...(systemPrompt ? [{
            role: 'system' as const,
            content: systemPrompt,
          }] : []),
          {
            role: 'user' as const,
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          ...(systemPrompt ? [{
            role: 'system' as const,
            content: systemPrompt + '\n\nRespond ONLY with valid JSON.',
          }] : [{
            role: 'system' as const,
            content: 'Respond ONLY with valid JSON.',
          }]),
          {
            role: 'user' as const,
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      return JSON.parse(content) as T;
    } catch (error) {
      console.error('OpenRouter JSON API error:', error);
      throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * OpenAI Provider (Direct)
 * For when you want to use OpenAI directly without OpenRouter
 */
export class OpenAIProvider implements IAIProvider {
  private client: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async analyze(prompt: string, systemPrompt?: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{
          role: 'system' as const,
          content: systemPrompt,
        }] : []),
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return completion.choices[0]?.message?.content || '';
  }

  async analyzeJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{
          role: 'system' as const,
          content: systemPrompt + '\n\nRespond ONLY with valid JSON.',
        }] : []),
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(content) as T;
  }
}

/**
 * Custom Provider
 * For enterprise customers with their own models
 */
export class CustomProvider implements IAIProvider {
  private client: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    
    if (!config.baseURL) {
      throw new Error('Custom provider requires baseURL');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async analyze(prompt: string, systemPrompt?: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{
          role: 'system' as const,
          content: systemPrompt,
        }] : []),
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return completion.choices[0]?.message?.content || '';
  }

  async analyzeJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages: [
        ...(systemPrompt ? [{
          role: 'system' as const,
          content: systemPrompt + '\n\nRespond ONLY with valid JSON.',
        }] : []),
        {
          role: 'user' as const,
          content: prompt,
        },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(content) as T;
  }
}

/**
 * Provider Factory
 * Creates the appropriate provider based on configuration
 */
export function createAIProvider(config: AIConfig): IAIProvider {
  switch (config.provider) {
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'custom':
      return new CustomProvider(config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}


