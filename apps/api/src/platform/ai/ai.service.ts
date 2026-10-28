import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '@platform/config/env.validation';

export interface CompletionOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** overrides OLLAMA_MODEL */
  model?: string;
  signal?: AbortSignal;
}

export interface Completion {
  content: string;
  model: string;
  /** tokens as reported by the host, when it reports them */
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

/**
 * LLM calls for Node tools, against the same Ollama host and models the Python
 * workers use (OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_EMBED_MODEL). Speaks the
 * OpenAI-compatible chat API, so a hosted provider is a base-URL change. Short
 * requests only: anything that can run for minutes belongs in a job handler.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  readonly baseUrl: string;
  readonly model: string;
  readonly embedModel: string;
  private readonly timeoutMs: number;
  /** replaced in tests */
  fetchImpl: typeof fetch = fetch;

  constructor(config: ConfigService<EnvironmentVariables>) {
    this.baseUrl = (config.get('OLLAMA_BASE_URL', { infer: true }) ?? '').replace(/\/$/, '');
    this.model = config.get('OLLAMA_MODEL', { infer: true }) ?? '';
    this.embedModel = config.get('OLLAMA_EMBED_MODEL', { infer: true }) ?? '';
    this.timeoutMs = (config.get('AI_TIMEOUT_SECONDS', { infer: true }) ?? 120) * 1000;
  }

  get configured(): boolean {
    return !!this.baseUrl && !!this.model;
  }

  /** True when the host answers; false when it is down (it is started by hand). */
  async available(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<Completion> {
    if (!this.configured) {
      throw new ServiceUnavailableException('LLM host not configured (OLLAMA_BASE_URL, OLLAMA_MODEL)');
    }
    const messages = [
      ...(options.system ? [{ role: 'system', content: options.system }] : []),
      { role: 'user', content: prompt },
    ];
    const model = options.model ?? this.model;
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: options.maxTokens ?? 1000,
          temperature: options.temperature ?? 0.3,
        }),
        signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger.warn(`LLM host unreachable: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('LLM host unreachable');
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`LLM host answered ${res.status}`);
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (typeof content !== 'string') {
      throw new ServiceUnavailableException('LLM host returned no completion');
    }
    return {
      content,
      model: body.model ?? model,
      promptTokens: body.usage?.prompt_tokens,
      completionTokens: body.usage?.completion_tokens,
      latencyMs: Date.now() - started,
    };
  }

  async embed(text: string): Promise<number[]> {
    if (!this.baseUrl || !this.embedModel) {
      throw new ServiceUnavailableException('Embedding model not configured (OLLAMA_EMBED_MODEL)');
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.embedModel, input: text }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('LLM host unreachable');
    }
    if (!res.ok) throw new ServiceUnavailableException(`LLM host answered ${res.status}`);
    const body = (await res.json()) as { embeddings?: number[][]; data?: Array<{ embedding: number[] }> };
    const vector = body.embeddings?.[0] ?? body.data?.[0]?.embedding;
    if (!vector) throw new ServiceUnavailableException('LLM host returned no embedding');
    return vector;
  }
}
