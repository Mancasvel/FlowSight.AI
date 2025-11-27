import axios from 'axios';

/**
 * LLMLocal: Run Phi-3 mini (3.8B) locally via Ollama
 * No cloud API, instant response, works offline
 */
export class LLMLocal {
  private ollamaUrl: string = 'http://localhost:11434/api/generate';
  private model: string = 'phi3:3.8b'; // Or your chosen model
  private isReady: boolean = false;

  async initialize(): Promise<void> {
    try {
      // Check if Ollama is running
      await axios.post(this.ollamaUrl, {
        model: this.model,
        prompt: 'test',
        stream: false,
      });
      this.isReady = true;
    } catch (error) {
      console.warn('Ollama not running. Install: brew install ollama && ollama serve');
      this.isReady = false;
    }
  }

  async analyzeBlocker(
    context: {
      ocrText: string;
      windowName: string;
      activityDuration: number;
      previousErrors: string[];
    }
  ): Promise<{
    blockerType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    suggestedAction: string;
    confidence: number;
  }> {
    if (!this.isReady) {
      throw new Error('LLM not initialized. Start Ollama: ollama serve');
    }

    const prompt = `
You are FlowSight, an AI productivity assistant for developers.

Context:
- Window: ${context.windowName}
- Activity Duration: ${context.activityDuration / 1000}s
- Screen Text: ${context.ocrText.substring(0, 500)}
- Recent Errors: ${context.previousErrors.join(', ')}

Analyze this situation and respond with ONLY valid JSON (no markdown, no code fences):
{
  "blockerType": "build_error|timeout|circular_dep|permission|resource|other",
  "severity": "low|medium|high|critical",
  "suggestedAction": "Brief actionable suggestion (1-2 sentences)",
  "confidence": 0.0 to 1.0
}
`;

    try {
      const response = await axios.post(this.ollamaUrl, {
        model: this.model,
        prompt,
        stream: false,
        temperature: 0.3, // Low temperature for deterministic output
        options: {
          num_predict: 200, // Limit response length
        }
      });

      const rawText = response.data.response;

      // Extract JSON from response (model might add explanation)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid JSON in response');

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        blockerType: parsed.blockerType || 'other',
        severity: parsed.severity || 'medium',
        suggestedAction: parsed.suggestedAction || 'Check console logs for more details',
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
      };
    } catch (error) {
      console.error('LLM analysis error:', error);
      return {
        blockerType: 'other',
        severity: 'low',
        suggestedAction: 'Check console logs for more details',
        confidence: 0.3,
      };
    }
  }

  async getBlockerInsights(
    blockerType: string,
    context: string
  ): Promise<string> {
    if (!this.isReady) {
      return 'LLM not available - ensure Ollama is running';
    }

    const prompt = `
As a senior developer, explain this blocker and provide 2-3 specific solutions:
Blocker: ${blockerType}
Context: ${context}

Keep response under 200 words.
`;

    try {
      const response = await axios.post(this.ollamaUrl, {
        model: this.model,
        prompt,
        stream: false,
        temperature: 0.2,
        options: {
          num_predict: 300,
        }
      });

      return response.data.response.trim();
    } catch (error) {
      return 'Unable to generate insights - LLM service unavailable';
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await axios.post(this.ollamaUrl, {
        model: this.model,
        prompt: 'ok',
        stream: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async listAvailableModels(): Promise<string[]> {
    try {
      const response = await axios.get('http://localhost:11434/api/tags');
      return response.data.models?.map((m: any) => m.name) || [];
    } catch {
      return [];
    }
  }

  public setModel(modelName: string): void {
    this.model = modelName;
  }
}
