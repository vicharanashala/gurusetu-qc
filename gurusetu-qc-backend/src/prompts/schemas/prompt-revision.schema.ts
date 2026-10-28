import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PromptRevisionDocument = HydratedDocument<PromptRevision>;

/**
 * Append-only audit log of every change to the active system prompt.
 * Unlike PromptConfig.history (capped at 25, stores only the replaced text),
 * each row here is the full prompt as it became active, plus who/where/when.
 * Rows are never updated or deleted by the app.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'prompt_revisions' })
export class PromptRevision {
  @Prop({ required: true, unique: true, index: true })
  rev!: number;

  @Prop({ required: true, enum: ['seed', 'update', 'reset', 'backfill'] })
  action!: 'seed' | 'update' | 'reset' | 'backfill';

  @Prop({ required: true })
  content!: string;

  @Prop({ required: true })
  contentSha256!: string;

  @Prop({ required: true })
  length!: number;

  @Prop()
  versionLabel?: string;

  @Prop()
  note?: string;

  /** Revision this one replaced; undefined for the first. */
  @Prop()
  previousRev?: number;

  /** From the verified session, never from the request body. */
  @Prop({ type: Object })
  editedBy?: { id?: string; username?: string };

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  /** For backfilled rows: when the change actually happened. */
  @Prop()
  effectiveAt?: Date;
}

export const PromptRevisionSchema = SchemaFactory.createForClass(PromptRevision);
