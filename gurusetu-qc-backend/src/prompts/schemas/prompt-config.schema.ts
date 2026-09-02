import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PromptConfigDocument = HydratedDocument<PromptConfig>;

/**
 * Singleton config doc keyed by `key`. We only ever use one document —
 * the GuruSetu QC system prompt. History is preserved inside the doc.
 */
@Schema({ timestamps: true, collection: 'prompt_configs' })
export class PromptConfig {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: 'v1' })
  versionLabel!: string;

  @Prop({ default: false })
  isDefault!: boolean;

  @Prop()
  note?: string;

  @Prop({ type: Object })
  lastEditedBy?: { id?: string; name?: string };

  @Prop({
    type: [
      {
        content: String,
        versionLabel: String,
        note: String,
        editedAt: Date,
        editedBy: { id: String, name: String },
      },
    ],
    default: [],
    _id: false,
  })
  history!: Array<{
    content: string;
    versionLabel?: string;
    note?: string;
    editedAt: Date;
    editedBy?: { id?: string; name?: string };
  }>;
}

export const PromptConfigSchema = SchemaFactory.createForClass(PromptConfig);
