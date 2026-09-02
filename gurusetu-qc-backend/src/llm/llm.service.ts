import { Injectable, Logger } from '@nestjs/common';
import {
  LlmConfigService,
  ResolvedLlmConfig,
} from '../llm-config/llm-config.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
  /** Override the stored config — used by the "Test connection" button. */
  override?: ResolvedLlmConfig;
}

export interface ChatResult {
  content: string;
  raw?: unknown;
  provider: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * Talks to whichever provider the admin configured in Settings (BYOK).
 *
 * Two wire protocols are supported, and the distinction is the request shape,
 * not the vendor:
 *   - anthropic → POST {base}/messages, system lifted out of the message list
 *   - openai    → POST {base}/chat/completions, system stays inline as a message
 *
 * Anything that speaks either protocol works: Anthropic itself, OpenAI, MiniMax,
 * OpenRouter, Together, a local vLLM/Ollama gateway, and so on.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly llmConfig: LlmConfigService) {}

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const cfg = options.override ?? (await this.llmConfig.resolve());

    if (cfg.protocol === 'mock') {
      return this.mockChat(messages, options);
    }
    if (!cfg.apiKey) {
      throw new Error(
        'No API key configured. Add one in Settings → LLM provider.',
      );
    }
    if (!cfg.model) {
      throw new Error('No model configured. Set one in Settings → LLM provider.');
    }

    const temperature = options.temperature ?? cfg.temperature;
    const maxTokens = options.maxTokens ?? cfg.maxTokens;

    return cfg.protocol === 'anthropic'
      ? this.chatAnthropic(cfg, messages, temperature, maxTokens, options)
      : this.chatOpenAi(cfg, messages, temperature, maxTokens, options);
  }

  // ===== Anthropic Messages protocol =====

  private async chatAnthropic(
    cfg: ResolvedLlmConfig,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    options: ChatOptions,
  ): Promise<ChatResult> {
    // System prompts are a top-level field here, not a message.
    const systemParts: string[] = [];
    const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
      if (m.role === 'system') systemParts.push(m.content);
      else turns.push({ role: m.role, content: m.content });
    }
    if (turns.length === 0) {
      throw new Error('LLM call requires at least one non-system message');
    }

    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: maxTokens,
      messages: turns,
      temperature,
    };
    if (systemParts.length > 0) body.system = systemParts.join('\n\n');
    if (!cfg.thinkingEnabled) body.thinking = { type: 'disabled' };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (cfg.authHeader === 'bearer') {
      headers.Authorization = `Bearer ${cfg.apiKey}`;
    } else {
      headers['x-api-key'] = cfg.apiKey;
    }

    const base = (cfg.baseUrl || DEFAULT_ANTHROPIC_BASE).replace(/\/$/, '');
    const data = await this.post(`${base}/messages`, headers, body, options.signal);

    let content = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        // Skip "thinking" blocks — they are not the answer.
        if (block?.type === 'text' && typeof block.text === 'string') {
          content += block.text;
        }
      }
    }
    if (!content && typeof data.completion === 'string') content = data.completion;

    return {
      content,
      raw: data,
      provider: 'anthropic',
      model: data.model ?? cfg.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens:
              (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  // ===== OpenAI Chat Completions protocol =====

  private async chatOpenAi(
    cfg: ResolvedLlmConfig,
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    options: ChatOptions,
  ): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
      max_tokens: maxTokens,
    };
    // Ask for a JSON object when the caller needs parseable output. Providers
    // that don't support the flag generally ignore it rather than erroring.
    if (options.json) body.response_format = { type: 'json_object' };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    };

    const base = (cfg.baseUrl || DEFAULT_OPENAI_BASE).replace(/\/$/, '');
    const data = await this.post(
      `${base}/chat/completions`,
      headers,
      body,
      options.signal,
    );

    const choice = data.choices?.[0];
    const raw = choice?.message?.content;
    const content =
      typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : '';

    return {
      content,
      raw: data,
      provider: 'openai',
      model: data.model ?? cfg.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  // ===== shared =====

  private async post(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, any>> {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      // Truncate: provider errors can echo the whole request back.
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as Record<string, any>;
  }

  private async mockChat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ChatResult> {
    // Deterministic placeholder so the pipeline can be exercised without a key.
    const last = messages[messages.length - 1]?.content ?? '';
    const payload = options.json
      ? {
          mock: true,
          received: last.slice(0, 200),
          note: 'Configure a real provider in Settings to receive real analysis.',
        }
      : `[mock LLM response] received prompt of ${last.length} chars`;
    return {
      content: JSON.stringify(payload),
      provider: 'mock',
      model: 'mock-echo',
    };
  }
}
