import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PromptConfig,
  PromptConfigDocument,
} from './schemas/prompt-config.schema';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { GURUSETU_QC_SYSTEM_PROMPT } from '../analysis/prompts/gurusetu-qc.prompt';

export const DEFAULT_PROMPT_KEY = 'gurusetu-qc-system';

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);
  private cache: { content: string; versionLabel: string } | null = null;

  constructor(
    @InjectModel(PromptConfig.name)
    private readonly model: Model<PromptConfigDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfMissing();
    await this.refreshCache();
  }

  /** Returns the currently-active system prompt. Falls back to the bundled default. */
  async getActive(): Promise<{ content: string; versionLabel: string; isDefault: boolean; updatedAt?: Date }> {
    if (!this.cache) await this.refreshCache();
    const doc = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).lean().exec();
    return {
      content: this.cache!.content,
      versionLabel: this.cache!.versionLabel,
      isDefault: doc?.isDefault ?? false,
      updatedAt: (doc as any)?.updatedAt,
    };
  }

  /** Returns the bundled default (immutable). */
  getDefault(): { content: string; versionLabel: string } {
    return { content: GURUSETU_QC_SYSTEM_PROMPT, versionLabel: 'bundled-default' };
  }

  /** Update the active prompt and append a history entry. */
  async update(dto: UpdatePromptDto): Promise<PromptConfigDocument> {
    const existing = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).exec();
    const previous = existing?.content ?? this.getDefault().content;
    const isFirstEdit = !existing || existing.isDefault;

    const next = await this.model.findOneAndUpdate(
      { key: DEFAULT_PROMPT_KEY },
      {
        $set: {
          content: dto.content,
          versionLabel: dto.versionLabel ?? existing?.versionLabel ?? 'custom',
          isDefault: false,
          note: dto.note,
          lastEditedBy: dto.editedBy,
        },
        $push: {
          history: {
            $each: [
              {
                content: previous,
                versionLabel: existing?.versionLabel,
                note: isFirstEdit ? 'previous default' : `replaced from ${existing?.versionLabel}`,
                editedAt: new Date(),
                editedBy: dto.editedBy,
              },
            ],
            $slice: -25, // keep last 25 history entries
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    await this.refreshCache();
    this.logger.log(`Active prompt updated → ${next.versionLabel} (default=${next.isDefault})`);
    return next;
  }

  /** Reset to bundled default; history is preserved. */
  async reset(editedBy?: { id?: string; name?: string }): Promise<PromptConfigDocument> {
    const existing = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).exec();
    const previous = existing?.content;
    const previousLabel = existing?.versionLabel;

    const next = await this.model.findOneAndUpdate(
      { key: DEFAULT_PROMPT_KEY },
      {
        $set: {
          content: GURUSETU_QC_SYSTEM_PROMPT,
          versionLabel: 'bundled-default',
          isDefault: true,
          lastEditedBy: editedBy,
        },
        $push: {
          history: {
            $each: [
              {
                content: previous,
                versionLabel: previousLabel,
                note: 'reset to bundled default',
                editedAt: new Date(),
                editedBy,
              },
            ],
            $slice: -25,
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    await this.refreshCache();
    this.logger.log(`Active prompt reset to bundled default`);
    return next;
  }

  /** Return the last N history entries (most-recent first). */
  async getHistory(limit = 10): Promise<PromptConfigDocument['history']> {
    const doc = await this.model
      .findOne({ key: DEFAULT_PROMPT_KEY }, { history: { $slice: -limit } })
      .lean()
      .exec();
    return (doc?.history ?? []).slice().reverse();
  }

  // ===== internals =====

  private async seedIfMissing(): Promise<void> {
    const exists = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).exec();
    if (exists) return;
    await this.model.create({
      key: DEFAULT_PROMPT_KEY,
      content: GURUSETU_QC_SYSTEM_PROMPT,
      versionLabel: 'bundled-default',
      isDefault: true,
    });
    this.logger.log(`Seeded default GuruSetu QC prompt into prompt_configs`);
  }

  private async refreshCache(): Promise<void> {
    const doc = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).lean().exec();
    if (!doc) {
      this.cache = { content: GURUSETU_QC_SYSTEM_PROMPT, versionLabel: 'bundled-default' };
      return;
    }
    this.cache = { content: doc.content, versionLabel: doc.versionLabel ?? 'v1' };
  }
}
