import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LlmConfig, LlmConfigDocument, LlmProtocol } from './schemas/llm-config.schema';
import { UpdateLlmConfigDto } from './dto/update-llm-config.dto';
import { decryptSecret, encryptSecret, maskSecret } from '../common/crypto/secret-box';
import { AppConfig } from '../config/configuration';

export const LLM_CONFIG_KEY = 'active';

/** Resolved, ready-to-use settings including the plaintext key (server-only). */
export interface ResolvedLlmConfig {
  protocol: LlmProtocol;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  authHeader: 'x-api-key' | 'bearer';
  maxTokens: number;
  temperature: number;
  thinkingEnabled: boolean;
}

@Injectable()
export class LlmConfigService implements OnModuleInit {
  private readonly logger = new Logger(LlmConfigService.name);
  private cache: ResolvedLlmConfig | null = null;

  constructor(
    @InjectModel(LlmConfig.name)
    private readonly model: Model<LlmConfigDocument>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfMissing();
    await this.refreshCache();
  }

  /** Server-side resolved config. Never expose this over HTTP — it has the key. */
  async resolve(): Promise<ResolvedLlmConfig> {
    if (!this.cache) await this.refreshCache();
    return this.cache!;
  }

  /** Safe projection for the admin UI: masked key, never the real one. */
  async getPublic() {
    const doc = await this.model.findOne({ key: LLM_CONFIG_KEY }).lean().exec();
    return {
      protocol: doc?.protocol ?? 'mock',
      label: doc?.label ?? '',
      baseUrl: doc?.baseUrl ?? '',
      model: doc?.model ?? '',
      apiKeyMasked: doc?.apiKeyMasked ?? '',
      hasApiKey: Boolean(doc?.apiKeyEnc),
      authHeader: doc?.authHeader ?? 'x-api-key',
      maxTokens: doc?.maxTokens ?? 4096,
      temperature: doc?.temperature ?? 0.2,
      thinkingEnabled: doc?.thinkingEnabled ?? false,
      lastTest: doc?.lastTest,
      updatedAt: (doc as any)?.updatedAt,
    };
  }

  async update(dto: UpdateLlmConfigDto, username?: string): Promise<void> {
    const set: Record<string, unknown> = {
      protocol: dto.protocol,
      label: dto.label ?? '',
      baseUrl: (dto.baseUrl ?? '').trim().replace(/\/$/, ''),
      model: (dto.model ?? '').trim(),
      authHeader: dto.authHeader ?? 'x-api-key',
      maxTokens: dto.maxTokens ?? 4096,
      temperature: dto.temperature ?? 0.2,
      thinkingEnabled: dto.thinkingEnabled ?? false,
      lastEditedBy: { username },
    };

    // undefined => leave the stored key alone; '' => explicitly clear it.
    if (dto.apiKey !== undefined) {
      const key = dto.apiKey.trim();
      if (key.length === 0) {
        set.apiKeyEnc = '';
        set.apiKeyMasked = '';
      } else {
        set.apiKeyEnc = encryptSecret(key, this.encryptionKey());
        set.apiKeyMasked = maskSecret(key);
      }
    }

    await this.model
      .findOneAndUpdate({ key: LLM_CONFIG_KEY }, { $set: set }, { upsert: true, new: true })
      .exec();
    await this.refreshCache();
    this.logger.log(`LLM config updated → protocol=${dto.protocol} model=${set.model}`);
  }

  async recordTest(result: {
    ok: boolean;
    message?: string;
    latencyMs?: number;
    model?: string;
  }): Promise<void> {
    await this.model
      .updateOne(
        { key: LLM_CONFIG_KEY },
        { $set: { lastTest: { at: new Date(), ...result } } },
        { upsert: true },
      )
      .exec();
  }

  // ===== internals =====

  private encryptionKey(): string {
    return this.config.get('auth.encryptionKey', { infer: true }) as string;
  }

  /**
   * First boot only: carry the .env values across so an existing deployment
   * keeps working after upgrading to DB-backed config.
   */
  private async seedIfMissing(): Promise<void> {
    const exists = await this.model.findOne({ key: LLM_CONFIG_KEY }).exec();
    if (exists) return;

    const protocol = this.config.get('llmProvider', { infer: true }) as LlmProtocol;
    const seed = this.config.get('llmSeed', { infer: true }) as AppConfig['llmSeed'];
    const apiKey = (seed.apiKey ?? '').trim();
    const usable = apiKey && apiKey !== 'replace-me' && apiKey !== 'unused-in-mock-mode';

    // Cast: the schema has a field literally named `model`, which collides with
    // mongoose's Document.model() in create()'s overload resolution.
    await this.model.create({
      key: LLM_CONFIG_KEY,
      protocol,
      label: protocol === 'mock' ? 'Mock (no real analysis)' : 'Seeded from .env',
      baseUrl: seed.baseUrl ?? '',
      model: seed.model ?? '',
      apiKeyEnc: usable ? encryptSecret(apiKey, this.encryptionKey()) : '',
      apiKeyMasked: usable ? maskSecret(apiKey) : '',
      // A seeded Anthropic-protocol base URL is far more likely to be a gateway
      // like MiniMax (Bearer) than api.anthropic.com itself, matching the
      // header the pre-BYOK code hardcoded.
      authHeader: 'bearer',
    } as any);
    this.logger.log(`Seeded llm_configs from environment (protocol=${protocol})`);
  }

  private async refreshCache(): Promise<void> {
    const doc = await this.model.findOne({ key: LLM_CONFIG_KEY }).lean().exec();
    if (!doc) {
      this.cache = {
        protocol: 'mock',
        label: 'mock',
        baseUrl: '',
        model: '',
        apiKey: '',
        authHeader: 'x-api-key',
        maxTokens: 4096,
        temperature: 0.2,
        thinkingEnabled: false,
      };
      return;
    }

    let apiKey = '';
    if (doc.apiKeyEnc) {
      try {
        apiKey = decryptSecret(doc.apiKeyEnc, this.encryptionKey());
      } catch {
        // Wrong or rotated ENCRYPTION_KEY. Fail loudly in the log but keep the
        // process up so the admin can log in and re-enter the key.
        this.logger.error(
          'Stored API key could not be decrypted — ENCRYPTION_KEY may have changed. Re-enter the key in Settings.',
        );
      }
    }

    this.cache = {
      protocol: doc.protocol,
      label: doc.label ?? '',
      baseUrl: doc.baseUrl ?? '',
      model: doc.model ?? '',
      apiKey,
      authHeader: doc.authHeader ?? 'x-api-key',
      maxTokens: doc.maxTokens ?? 4096,
      temperature: doc.temperature ?? 0.2,
      thinkingEnabled: doc.thinkingEnabled ?? false,
    };
  }
}
