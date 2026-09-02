import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EvaluationDocument = HydratedDocument<Evaluation>;

export enum EvaluationStatus {
  PENDING = 'pending',
  TRANSCRIBING = 'transcribing',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EvaluationSourceType {
  TEXT = 'text',
  FILE_AUDIO = 'file_audio',
  FILE_VIDEO = 'file_video',
  FILE_TEXT = 'file_text',
  YOUTUBE = 'youtube',
}

export enum ClaimVerdict {
  GREEN = 'green',
  AMBER = 'amber',
  RED = 'red',
}

@Schema({ _id: false })
export class ClaimItem {
  @Prop({ required: true }) index!: number;
  @Prop({ required: true }) claim!: string;
  @Prop({ required: true, enum: ClaimVerdict }) verdict!: ClaimVerdict;
  @Prop({ default: false }) loadBearing!: boolean;
  @Prop({ default: false }) knownMyth!: boolean;
  @Prop() basis!: string;
  @Prop() correction?: string;
  @Prop() speakerCategory?: string;
}

@Schema({ _id: false })
export class Scorecard {
  @Prop({ required: true }) factualAccuracy!: number;
  @Prop({ required: true }) evidenceGrounding!: number;
  @Prop({ required: true }) citationHygiene!: number;
  @Prop({ required: true }) epistemicHygiene!: number;
  @Prop({ required: true }) pedagogicalSoundness!: number;
  @Prop({ required: true }) internalCoherence!: number;
  @Prop({ required: true }) deliveryCleanliness!: number;
  @Prop() currency?: number;
  @Prop() localization?: number;
  @Prop() editorialNeutrality?: number;
}

@Schema({ _id: false })
export class Tally {
  @Prop({ default: 0 }) green!: number;
  @Prop({ default: 0 }) amber!: number;
  @Prop({ default: 0 }) red!: number;
  @Prop({ default: 0 }) total!: number;
  @Prop({ default: 0 }) loadBearingReds!: number;
  @Prop({ type: [String], default: [] }) loadBearingClaims!: string[];
}

@Schema({ _id: false })
export class VerticalFit {
  @Prop() bestFit!: string;
  @Prop() secondary!: string;
  @Prop() rating!: string;
  @Prop() justification!: string;
}

@Schema({ _id: false })
export class AnalysisResult {
  @Prop({ type: [ClaimItem], default: [] }) claims!: ClaimItem[];
  @Prop({ type: Tally }) tally!: Tally;
  @Prop({ type: Scorecard }) scorecard!: Scorecard;
  @Prop() overallScore!: number;
  @Prop() verdict!: string;
  @Prop() qualitativeSummary?: string;
  @Prop({ type: [String], default: [] }) requiredFixes!: string[];
  @Prop({ type: [String], default: [] }) citationPack!: string[];
  @Prop({ type: VerticalFit }) verticalFit!: VerticalFit;
}

@Schema({ _id: false })
export class TranscriptSegment {
  @Prop() text!: string;
  @Prop() startSec?: number;
  @Prop() endSec?: number;
  @Prop() speaker?: string;
}

@Schema({ _id: false })
export class SourceInfo {
  @Prop({ required: true, enum: EvaluationSourceType }) type!: EvaluationSourceType;
  @Prop() originalFilename?: string;
  @Prop() mimeType?: string;
  @Prop() sizeBytes?: number;
  @Prop() storedPath?: string;
  @Prop() url?: string;
  @Prop() youtubeId?: string;
  @Prop() youtubeTitle?: string;
  @Prop() youtubeChannel?: string;
  @Prop() youtubeDurationSec?: number;
}

@Schema({ timestamps: true, collection: 'evaluations' })
export class Evaluation {
  @Prop({ required: true, unique: true, index: true })
  evaluationId!: string;

  @Prop({ required: true, index: true })
  title!: string;

  @Prop({ required: true, enum: EvaluationSourceType })
  sourceType!: EvaluationSourceType;

  @Prop({ type: SourceInfo, required: true })
  source!: SourceInfo;

  @Prop({ required: true, enum: EvaluationStatus, default: EvaluationStatus.PENDING, index: true })
  status!: EvaluationStatus;

  @Prop({ default: 0 }) progressPercent!: number;

  @Prop() statusMessage?: string;

  @Prop() transcript?: string;

  @Prop({ type: [TranscriptSegment], default: [] })
  transcriptSegments!: TranscriptSegment[];

  @Prop() transcriptEngine?: string;
  @Prop() transcriptDurationSec?: number;
  @Prop() transcriptLanguage?: string;

  @Prop({ type: AnalysisResult })
  analysis?: AnalysisResult;

  @Prop() analysisEngine?: string;
  @Prop() analysisModel?: string;
  @Prop() analysisPromptVersion?: string;

  @Prop({ default: 1 }) runNumber!: number;
  @Prop() parentEvaluationId?: string;

  @Prop({ type: [String], default: [] }) tags!: string[];
  @Prop() createdBy?: string;

  @Prop() failureReason?: string;

  // Audit
  @Prop({ type: Object }) timingsMs?: Record<string, number>;
}

export const EvaluationSchema = SchemaFactory.createForClass(Evaluation);
EvaluationSchema.index({ createdAt: -1 });
EvaluationSchema.index({ 'analysis.overallScore': -1 });
