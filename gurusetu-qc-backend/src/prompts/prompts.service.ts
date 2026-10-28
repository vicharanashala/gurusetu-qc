import { createHash } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PromptConfig,
  PromptConfigDocument,
} from './schemas/prompt-config.schema';
import {
  PromptRevision,
  PromptRevisionDocument,
} from './schemas/prompt-revision.schema';
import { UpdatePromptDto } from './dto/update-prompt.dto';
import { GURUSETU_QC_SYSTEM_PROMPT } from '../analysis/prompts/gurusetu-qc.prompt';

export const DEFAULT_PROMPT_KEY = 'gurusetu-qc-system';
const BUNDLED_LABEL = 'bundled-default';

/** Who made a change, taken from the verified session and the request. */
export interface PromptActor {
  id?: string;
  username?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);
  private cache: { content: string; versionLabel: string } | null = null;

  constructor(
    @InjectModel(PromptConfig.name)
    private readonly model: Model<PromptConfigDocument>,
    @InjectModel(PromptRevision.name)
    private readonly revisions: Model<PromptRevisionDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfMissing();
    await this.backfillRevisionsIfEmpty();
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
  async update(dto: UpdatePromptDto, actor: PromptActor = {}): Promise<PromptConfigDocument> {
    const existing = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).exec();
    const previous = existing?.content ?? this.getDefault().content;
    const isFirstEdit = !existing || existing.isDefault;
    const editedBy = { id: actor.id, name: actor.username };
    const nextRev = await this.nextRevNumber();

    // The settings form pre-fills the current label, so an edited prompt used
    // to inherit "bundled-default". Custom content must never carry that label.
    let versionLabel = dto.versionLabel ?? existing?.versionLabel ?? 'custom';
    if (versionLabel === BUNDLED_LABEL && dto.content !== GURUSETU_QC_SYSTEM_PROMPT) {
      versionLabel = `rev-${nextRev}`;
    }

    const next = await this.model.findOneAndUpdate(
      { key: DEFAULT_PROMPT_KEY },
      {
        $set: {
          content: dto.content,
          versionLabel,
          isDefault: false,
          note: dto.note,
          lastEditedBy: editedBy,
        },
        $push: {
          history: {
            $each: [
              {
                content: previous,
                versionLabel: existing?.versionLabel,
                note: isFirstEdit ? 'previous default' : `replaced from ${existing?.versionLabel}`,
                editedAt: new Date(),
                editedBy,
              },
            ],
            $slice: -25, // keep last 25 history entries
          },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    await this.recordRevision(nextRev, 'update', next.content, actor, {
      versionLabel: next.versionLabel,
      note: dto.note,
    });
    await this.refreshCache();
    this.logger.log(
      `Active prompt updated → ${next.versionLabel} (rev ${nextRev}, ${next.content.length} chars) by ${actor.username ?? 'unknown'} from ${actor.ip ?? 'unknown ip'}`,
    );
    return next;
  }

  /** Reset to bundled default; history is preserved. */
  async reset(actor: PromptActor = {}): Promise<PromptConfigDocument> {
    const editedBy = { id: actor.id, name: actor.username };
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

    const rev = await this.nextRevNumber();
    await this.recordRevision(rev, 'reset', next.content, actor, {
      versionLabel: BUNDLED_LABEL,
      note: 'reset to bundled default',
    });
    await this.refreshCache();
    this.logger.log(
      `Active prompt reset to bundled default (rev ${rev}) by ${actor.username ?? 'unknown'} from ${actor.ip ?? 'unknown ip'}`,
    );
    return next;
  }

  /** Full audit log, newest first, without prompt bodies. */
  async listRevisions(limit = 50) {
    return this.revisions
      .find({}, { content: 0 })
      .sort({ rev: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  /** One audit-log entry including the full prompt text. */
  async getRevision(rev: number) {
    return this.revisions.findOne({ rev }).lean().exec();
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

  private async nextRevNumber(): Promise<number> {
    const last = await this.revisions.findOne({}, { rev: 1 }).sort({ rev: -1 }).lean().exec();
    return (last?.rev ?? 0) + 1;
  }

  private async recordRevision(
    rev: number,
    action: PromptRevision['action'],
    content: string,
    actor: PromptActor,
    extra: { versionLabel?: string; note?: string; effectiveAt?: Date } = {},
  ): Promise<void> {
    try {
      await this.revisions.create({
        rev,
        action,
        content,
        contentSha256: createHash('sha256').update(content).digest('hex'),
        length: content.length,
        previousRev: rev > 1 ? rev - 1 : undefined,
        editedBy: actor.id || actor.username ? { id: actor.id, username: actor.username } : undefined,
        ip: actor.ip,
        userAgent: actor.userAgent,
        ...extra,
      });
    } catch (err) {
      // The prompt change itself already succeeded; never fail the request
      // over the audit row, but make the gap loud in the log.
      this.logger.error(`Failed to record prompt revision ${rev}: ${(err as Error).message}`);
    }
  }

  /**
   * One-time: rebuild the audit log from PromptConfig.history so changes made
   * before prompt_revisions existed are still on record.
   */
  private async backfillRevisionsIfEmpty(): Promise<void> {
    if ((await this.revisions.estimatedDocumentCount()) > 0) return;
    const doc = await this.model.findOne({ key: DEFAULT_PROMPT_KEY }).lean().exec();
    if (!doc) return;

    const history = (doc.history ?? []).filter((h) => h.content);
    let since: Date | undefined = (doc as any).createdAt;
    let rev = 0;
    for (const h of history) {
      await this.recordRevision(++rev, 'backfill', h.content, { username: h.editedBy?.name }, {
        versionLabel: h.versionLabel,
        note: 'backfilled from prompt history (no editor/IP was recorded at the time)',
        effectiveAt: since,
      });
      since = h.editedAt;
    }
    await this.recordRevision(++rev, 'backfill', doc.content, { username: doc.lastEditedBy?.name }, {
      versionLabel: doc.versionLabel,
      note: 'backfilled: prompt active when the audit log was introduced (no editor/IP was recorded at the time)',
      effectiveAt: since,
    });
    this.logger.log(`Backfilled ${rev} prompt revision(s) into prompt_revisions`);
  }

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
