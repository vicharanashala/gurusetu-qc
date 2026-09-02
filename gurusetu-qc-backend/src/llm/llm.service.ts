import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
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

/**
 * Sends chat requests to the configured LLM provider.
 *
 * The MiniMax provider exposed at agent.minimax.io speaks the Anthropic Messages
 * protocol (URL .../v1/messages, x-api-key auth) regardless of which Claude /
 * M-* model is named. We therefore always use the Messages protocol when talking
 * to the MiniMax base URL.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResult> {
    const provider = this.config.get('llmProvider', { infer: true });
    const temperature = options.temperature ?? 0.2;
    const maxTokens = options.maxTokens ?? 4096;

    if (provider === 'mock') {
      return this.mockChat(messages, options);
    }

    const urlBase = this.config.get('minimax.baseUrl', { infer: true });
    const apiKey = this.config.get('minimax.apiKey', { infer: true });
    const model = this.config.get('minimax.model', { infer: true });

    // Anthropic Messages protocol: lift system messages out, keep user/assistant.
    const systemParts: string[] = [];
    const filtered: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemParts.push(m.content);
      } else if (m.role === 'user' || m.role === 'assistant') {
        filtered.push({ role: m.role, content: m.content });
      }
    }
    if (filtered.length === 0) {
      throw new Error('LLM call requires at least one non-system message');
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: filtered,
      temperature,
    };
    if (systemParts.length > 0) {
      body.system = systemParts.join('\n\n');
    }
    // Disable extended thinking by default — analysis output should land in
    // text blocks, not eat the budget on internal reasoning. Operators can
    // flip MINIMAX_THINKING=enable to opt back in.
    if ((process.env.MINIMAX_THINKING ?? 'disable') !== 'enable') {
      body.thinking = { type: 'disabled' };
    }

    const res = await fetch(`${urlBase.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as Record<string, any>;
    let content = '';
    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        // Skip "thinking" blocks — they don't represent the final answer.
        if (block?.type === 'text' && typeof block.text === 'string') {
          content += block.text;
        }
      }
    }
    if (!content && typeof data.completion === 'string') {
      content = data.completion;
    }
    if (!content && data.choices?.[0]?.message?.content) {
      content =
        typeof data.choices[0].message.content === 'string'
          ? data.choices[0].message.content
          : JSON.stringify(data.choices[0].message.content);
    }

    return {
      content,
      raw: data,
      provider: 'minimax',
      model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens ?? data.usage.prompt_tokens,
            completionTokens:
              data.usage.output_tokens ?? data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  private async mockChat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): Promise<ChatResult> {
    // Deterministic placeholder so the pipeline can be exercised without a key.
    const last = messages[messages.length - 1]?.content ?? '';
    const summary = last.slice(0, 200);
    const payload = options.json
      ? {
          mock: true,
          received: summary,
          note: 'Set LLM_PROVIDER=minimax or openai to receive real analysis.',
        }
      : `[mock LLM response] received prompt of ${last.length} chars`;
    return {
      content: JSON.stringify(payload),
      provider: 'mock',
      model: 'mock-echo',
    };
  }
}
