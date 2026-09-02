import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LlmConfigDocument = HydratedDocument<LlmConfig>;

/** Wire protocol to speak, which is what actually determines the request shape. */
export type LlmProtocol = 'anthropic' | 'openai' | 'mock';

/**
 * Singleton document (key: 'active'). Holds the admin-supplied provider
 * credentials — "bring your own key".
 *
 * apiKeyEnc is an AES-256-GCM envelope (see common/crypto/secret-box.ts); the
 * plaintext key is never stored and never leaves the server.
 */
@Schema({ timestamps: true, collection: 'llm_configs' })
export class LlmConfig {
  @Prop({ required: true, unique: true, index: true, default: 'active' })
  key!: string;

  @Prop({ required: true, enum: ['anthropic', 'openai', 'mock'], default: 'mock' })
  protocol!: LlmProtocol;

  /** Free-text label so the admin can tell "Anthropic" from "MiniMax" etc. */
  @Prop({ default: '' })
  label!: string;

  /** e.g. https://api.anthropic.com/v1 or https://api.openai.com/v1 */
  @Prop({ default: '' })
  baseUrl!: string;

  @Prop({ default: '' })
  model!: string;

  @Prop({ default: '' })
  apiKeyEnc!: string;

  /** Shown in the UI so the admin can confirm which key is loaded. */
  @Prop({ default: '' })
  apiKeyMasked!: string;

  /**
   * Anthropic's own API authenticates with `x-api-key`; Anthropic-compatible
   * gateways (MiniMax, some proxies) want `Authorization: Bearer`. Same
   * protocol, different header — so it has to be selectable.
   */
  @Prop({ enum: ['x-api-key', 'bearer'], default: 'x-api-key' })
  authHeader!: 'x-api-key' | 'bearer';

  @Prop({ default: 4096 })
  maxTokens!: number;

  @Prop({ default: 0.2 })
  temperature!: number;

  /** Anthropic extended thinking. Off by default: it eats the token budget. */
  @Prop({ default: false })
  thinkingEnabled!: boolean;

  @Prop({ type: Object })
  lastTest?: {
    at: Date;
    ok: boolean;
    message?: string;
    latencyMs?: number;
    model?: string;
  };

  @Prop({ type: Object })
  lastEditedBy?: { username?: string };
}

export const LlmConfigSchema = SchemaFactory.createForClass(LlmConfig);
