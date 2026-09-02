import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { promises as fsp, createWriteStream, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { pipeline } from 'stream/promises';

import { AppConfig } from '../config/configuration';
import {
  Evaluation,
  EvaluationDocument,
  EvaluationSourceType,
  EvaluationStatus,
  SourceInfo,
} from './schemas/evaluation.schema';
import {
  CreateTextEvaluationDto,
  CreateYoutubeEvaluationDto,
} from './dto/create-evaluation.dto';
import { QueryEvaluationDto } from './dto/query-evaluation.dto';
import { YoutubeService } from '../youtube/youtube.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { AnalysisService } from '../analysis/analysis.service';
import { LlmService } from '../llm/llm.service';
import { LlmConfigService } from '../llm-config/llm-config.service';
import { PromptsService } from '../prompts/prompts.service';
import { TranscriptResult } from '../transcription/transcription.service';

export interface CreateFromTextInput {
  dto: CreateTextEvaluationDto;
}

export interface CreateFromYoutubeInput {
  dto: CreateYoutubeEvaluationDto;
}

export interface CreateFromFileInput {
  file: Express.Multer.File;
  title?: string;
  language?: string;
  createdBy?: string;
  tags?: string[];
}

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    @InjectModel(Evaluation.name)
    private readonly model: Model<EvaluationDocument>,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly youtube: YoutubeService,
    private readonly transcription: TranscriptionService,
    private readonly analysis: AnalysisService,
    private readonly llm: LlmService,
    private readonly prompts: PromptsService,
    private readonly llmConfig: LlmConfigService,
  ) {}

  // ===== Creation entrypoints =====

  async createFromText(input: CreateFromTextInput): Promise<EvaluationDocument> {
    const { dto } = input;
    if (dto.sourceType !== EvaluationSourceType.TEXT) {
      throw new BadRequestException(
        'createFromText requires sourceType=text',
      );
    }
    const evaluationId = uuidv4();
    const title =
      dto.title?.trim() ||
      `Text audit — ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;

    const created = await this.model.create({
      evaluationId,
      title,
      sourceType: EvaluationSourceType.TEXT,
      status: EvaluationStatus.PENDING,
      progressPercent: 5,
      source: {
        type: EvaluationSourceType.TEXT,
      },
      transcript: dto.text,
      transcriptSegments: [],
      transcriptEngine: 'manual',
      tags: dto.tags ?? [],
      createdBy: dto.createdBy,
    });

    void this.runAnalysis(created.evaluationId).catch((err) =>
      this.logger.error(
        `runAnalysis failed for ${evaluationId}: ${(err as Error).message}`,
      ),
    );

    return created;
  }

  async createFromYoutube(
    input: CreateFromYoutubeInput,
  ): Promise<EvaluationDocument> {
    const { dto } = input;
    if (dto.sourceType !== EvaluationSourceType.YOUTUBE) {
      throw new BadRequestException(
        'createFromYoutube requires sourceType=youtube',
      );
    }
    const videoId = this.youtube.extractVideoId(dto.url);
    const evaluationId = uuidv4();

    const created = await this.model.create({
      evaluationId,
      title: dto.title?.trim() || `YouTube audit — ${videoId}`,
      sourceType: EvaluationSourceType.YOUTUBE,
      status: EvaluationStatus.TRANSCRIBING,
      progressPercent: 5,
      source: {
        type: EvaluationSourceType.YOUTUBE,
        url: dto.url,
        youtubeId: videoId,
      },
      tags: dto.tags ?? [],
      createdBy: dto.createdBy,
    });

    void this.runYoutubePipeline(evaluationId).catch((err) =>
      this.logger.error(
        `YouTube pipeline failed for ${evaluationId}: ${(err as Error).message}`,
      ),
    );

    return created;
  }

  async createFromFile(
    input: CreateFromFileInput,
  ): Promise<EvaluationDocument> {
    const { file } = input;
    if (!file) throw new BadRequestException('file is required');

    const mime = (file.mimetype || '').toLowerCase();
    const sourceType = this.detectSourceType(mime, file.originalname);

    const evaluationId = uuidv4();
    const storedName = `${evaluationId}${extname(file.originalname) || ''}`;
    const storedPath = await this.persistUpload(file, storedName);

    const title =
      input.title?.trim() || file.originalname || `Uploaded audit ${evaluationId}`;

    const created = await this.model.create({
      evaluationId,
      title,
      sourceType,
      status:
        sourceType === EvaluationSourceType.FILE_TEXT
          ? EvaluationStatus.PENDING
          : EvaluationStatus.TRANSCRIBING,
      progressPercent: 5,
      source: {
        type: sourceType,
        originalFilename: file.originalname,
        mimeType: mime,
        sizeBytes: file.size,
        storedPath,
      },
      tags: input.tags ?? [],
      createdBy: input.createdBy,
    });

    void this.runFilePipeline(evaluationId).catch((err) =>
      this.logger.error(
        `File pipeline failed for ${evaluationId}: ${(err as Error).message}`,
      ),
    );

    return created;
  }

  // ===== Queries =====

  async list(query: QueryEvaluationDto): Promise<{
    items: EvaluationDocument[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.sourceType) filter.sourceType = query.sourceType;
    if (query.search) {
      const re = new RegExp(this.escapeRegex(query.search), 'i');
      filter.$or = [{ title: re }, { transcript: re }];
    }
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total, limit, offset };
  }

  async findOne(evaluationId: string): Promise<EvaluationDocument> {
    const doc = await this.model.findOne({ evaluationId }).exec();
    if (!doc) throw new NotFoundException(`Evaluation not found: ${evaluationId}`);
    return doc;
  }

  async rerun(evaluationId: string): Promise<EvaluationDocument> {
    const prev = await this.findOne(evaluationId);
    const newEvaluationId = uuidv4();

    const baseStatus =
      prev.sourceType === EvaluationSourceType.TEXT
        ? EvaluationStatus.PENDING
        : EvaluationStatus.TRANSCRIBING;

    const newDoc = await this.model.create({
      evaluationId: newEvaluationId,
      title: prev.title,
      sourceType: prev.sourceType,
      status: baseStatus,
      progressPercent: 5,
      statusMessage: 'Rerun queued',
      source: prev.source,
      transcript: prev.transcript,
      transcriptSegments: prev.transcriptSegments ?? [],
      transcriptEngine: prev.transcriptEngine,
      transcriptDurationSec: prev.transcriptDurationSec,
      transcriptLanguage: prev.transcriptLanguage,
      tags: prev.tags ?? [],
      createdBy: prev.createdBy,
      runNumber: (prev.runNumber ?? 1) + 1,
      parentEvaluationId: prev.evaluationId,
    });

    const next = newEvaluationId;
    if (prev.sourceType === EvaluationSourceType.TEXT) {
      void this.runAnalysis(next).catch((err) =>
        this.logger.error(`rerun analysis failed: ${(err as Error).message}`),
      );
    } else if (prev.sourceType === EvaluationSourceType.YOUTUBE) {
      void this.runYoutubePipeline(next).catch((err) =>
        this.logger.error(`rerun YT pipeline failed: ${(err as Error).message}`),
      );
    } else {
      void this.runFilePipeline(next).catch((err) =>
        this.logger.error(`rerun file pipeline failed: ${(err as Error).message}`),
      );
    }
    return newDoc;
  }

  async remove(evaluationId: string): Promise<{ deleted: true; evaluationId: string }> {
    const doc = await this.findOne(evaluationId);
    // best-effort cleanup of stored files
    if (doc.source?.storedPath) {
      fsp.unlink(doc.source.storedPath).catch(() => undefined);
    }
    await this.model.deleteOne({ evaluationId }).exec();
    return { deleted: true, evaluationId };
  }

  async stats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySourceType: Record<string, number>;
    averageScore: number | null;
  }> {
    const [total, byStatusAgg, bySourceAgg, scored] = await Promise.all([
      this.model.countDocuments().exec(),
      this.model.aggregate([
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      this.model.aggregate([
        { $group: { _id: '$sourceType', n: { $sum: 1 } } },
      ]),
      this.model
        .find({ 'analysis.overallScore': { $exists: true } })
        .select('analysis.overallScore')
        .lean()
        .exec(),
    ]);
    const byStatus: Record<string, number> = {};
    for (const r of byStatusAgg) byStatus[r._id] = r.n;
    const bySourceType: Record<string, number> = {};
    for (const r of bySourceAgg) bySourceType[r._id] = r.n;
    const averageScore =
      scored.length === 0
        ? null
        : Math.round(
            (scored.reduce(
              (a, b) => a + ((b as any).analysis?.overallScore ?? 0),
              0,
            ) /
              scored.length) *
              10,
          ) / 10;
    return { total, byStatus, bySourceType, averageScore };
  }

  // ===== Pipelines =====

  private async runYoutubePipeline(evaluationId: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const doc = await this.findOne(evaluationId);
      const url = doc.source.url!;
      const videoId = doc.source.youtubeId!;

      // 1) Try captions first (no LLM cost)
      let transcript: TranscriptResult | null = null;
      await this.updateProgress(evaluationId, 15, 'Fetching captions if available');

      transcript = await this.transcription.tryYoutubeCaptions(url, videoId);

      let downloadedAudioPath: string | null = null;
      let meta = { id: videoId, title: '', channel: '', durationSec: 0, webpageUrl: url };

      if (!transcript) {
        await this.updateProgress(
          evaluationId,
          25,
          'No captions — downloading audio',
        );
        const dl = await this.youtube.downloadAudio(url, videoId);
        downloadedAudioPath = dl.audioPath;
        meta = dl.meta;
        await this.updateProgress(evaluationId, 55, 'Transcribing audio');
        transcript = await this.transcription.transcribeFile(dl.audioPath);
      } else {
        await this.updateProgress(evaluationId, 60, 'Captions acquired');
        // Try to fetch metadata cheaply even when captions succeed.
        // yt-dlp can be flaky on rate limits, so retry once with a backoff.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            meta = await this.youtube.probe(url);
            break;
          } catch (err) {
            this.logger.warn(
              `yt-dlp probe attempt ${attempt + 1} failed: ${(err as Error).message}`,
            );
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      }

      await this.model.updateOne(
        { evaluationId },
        {
          $set: {
            title: doc.title.startsWith('YouTube audit —')
              ? meta.title || doc.title
              : doc.title,
            status: EvaluationStatus.ANALYZING,
            progressPercent: 70,
            'source.youtubeTitle': meta.title,
            'source.youtubeChannel': meta.channel,
            'source.youtubeDurationSec': meta.durationSec,
            transcript: transcript.text,
            transcriptSegments: transcript.segments,
            transcriptEngine: transcript.engine,
            transcriptLanguage: transcript.language,
            transcriptDurationSec: transcript.durationSec ?? meta.durationSec,
          },
        },
      );

      if (downloadedAudioPath) {
        await this.transcription.cleanup(downloadedAudioPath);
      }
      if (meta) {
        // try to clean up the yt-dlp .info.json sidecar if any
        // (transcription.tryYoutubeCaptions already removed its own vtt)
      }

      await this.runAnalysisInner(evaluationId, {
        verticalHint: undefined,
      });

      await this.recordTimings(evaluationId, { total: Date.now() - startedAt });
    } catch (err) {
      await this.markFailed(evaluationId, err);
    }
  }

  private async runFilePipeline(evaluationId: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const doc = await this.findOne(evaluationId);
      const storedPath = doc.source.storedPath!;

      if (doc.sourceType === EvaluationSourceType.FILE_TEXT) {
        const buf = await fsp.readFile(storedPath, 'utf-8');
        await this.model.updateOne(
          { evaluationId },
          {
            $set: {
              status: EvaluationStatus.ANALYZING,
              progressPercent: 60,
              transcript: buf,
              transcriptEngine: 'manual',
            },
          },
        );
        await this.runAnalysisInner(evaluationId, {});
        await this.recordTimings(evaluationId, { total: Date.now() - startedAt });
        return;
      }

      // Audio / Video → transcribe
      await this.updateProgress(evaluationId, 55, 'Transcribing audio');
      const transcript = await this.transcription.transcribeFile(storedPath);

      await this.model.updateOne(
        { evaluationId },
        {
          $set: {
            status: EvaluationStatus.ANALYZING,
            progressPercent: 70,
            transcript: transcript.text,
            transcriptSegments: transcript.segments,
            transcriptEngine: transcript.engine,
            transcriptLanguage: transcript.language,
            transcriptDurationSec: transcript.durationSec,
          },
        },
      );

      await this.runAnalysisInner(evaluationId, {});
      await this.recordTimings(evaluationId, { total: Date.now() - startedAt });
    } catch (err) {
      await this.markFailed(evaluationId, err);
    }
  }

  private async runAnalysis(evaluationId: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const doc = await this.findOne(evaluationId);
      await this.model.updateOne(
        { evaluationId },
        {
          $set: {
            status: EvaluationStatus.ANALYZING,
            progressPercent: doc.transcript ? 70 : 50,
          },
        },
      );
      await this.runAnalysisInner(evaluationId, {});
      await this.recordTimings(evaluationId, { total: Date.now() - startedAt });
    } catch (err) {
      await this.markFailed(evaluationId, err);
    }
  }

  private async runAnalysisInner(
    evaluationId: string,
    opts: { verticalHint?: string },
  ): Promise<void> {
    await this.updateProgress(evaluationId, 75, 'Running quality analysis');
    const doc = await this.findOne(evaluationId);
    if (!doc.transcript || doc.transcript.trim().length === 0) {
      throw new Error('Transcript is empty; cannot analyze.');
    }
    const result = await this.analysis.analyze(doc.transcript, {
      title: doc.title,
      verticalHint: opts.verticalHint,
    });
    // Record what actually ran, read from the admin-configured provider rather
    // than from .env — the two can differ now that config lives in the DB.
    const activeLlm = await this.llmConfig.resolve();
    const llmProvider = activeLlm.protocol;
    const model = activeLlm.protocol === 'mock' ? 'mock' : activeLlm.model;

    const activePrompt = await this.prompts.getActive();

    await this.model.updateOne(
      { evaluationId },
      {
        $set: {
          status: EvaluationStatus.COMPLETED,
          progressPercent: 100,
          statusMessage: 'Completed',
          analysis: result,
          analysisEngine: llmProvider,
          analysisModel: model,
          analysisPromptVersion: activePrompt.versionLabel,
        },
      },
    );
  }

  // ===== Helpers =====

  private async updateProgress(
    evaluationId: string,
    percent: number,
    message?: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { evaluationId },
        {
          $set: {
            progressPercent: percent,
            statusMessage: message,
            updatedAt: new Date(),
          },
        },
      )
      .exec();
  }

  private async recordTimings(
    evaluationId: string,
    additions: Record<string, number>,
  ): Promise<void> {
    const doc = await this.model.findOne({ evaluationId }).select('timingsMs').exec();
    const merged = { ...(doc?.timingsMs ?? {}), ...additions };
    await this.model
      .updateOne({ evaluationId }, { $set: { timingsMs: merged } })
      .exec();
  }

  private async markFailed(evaluationId: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Evaluation ${evaluationId} failed: ${message}`);
    await this.model
      .updateOne(
        { evaluationId },
        {
          $set: {
            status: EvaluationStatus.FAILED,
            failureReason: message.slice(0, 1000),
          },
        },
      )
      .exec();
  }

  private detectSourceType(
    mime: string,
    filename: string,
  ): EvaluationSourceType {
    if (mime.startsWith('video/')) return EvaluationSourceType.FILE_VIDEO;
    if (mime.startsWith('audio/')) return EvaluationSourceType.FILE_AUDIO;
    const textMimes = ['text/', 'application/json', 'application/xml'];
    if (textMimes.some((m) => mime.startsWith(m))) {
      return EvaluationSourceType.FILE_TEXT;
    }
    const ext = extname(filename).toLowerCase();
    if (['.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.srt', '.vtt'].includes(ext)) {
      return EvaluationSourceType.FILE_TEXT;
    }
    if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus'].includes(ext)) {
      return EvaluationSourceType.FILE_AUDIO;
    }
    if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.m4v'].includes(ext)) {
      return EvaluationSourceType.FILE_VIDEO;
    }
    throw new BadRequestException(
      `Unsupported file type (mime=${mime}, name=${filename}). Allowed: video/*, audio/*, .txt/.md/.json/.srt/.vtt.`,
    );
  }

  private async persistUpload(
    file: Express.Multer.File,
    storedName: string,
  ): Promise<string> {
    const uploadDir = this.config.get('uploadDir', { infer: true }) as string;
    const fullPath = join(uploadDir, storedName);

    // Nest's FileInterceptor uses multer's memoryStorage by default, so the
    // file content lives in `file.buffer`. If a stream was provided (disk
    // storage), pipe it; otherwise write the buffer directly.
    if (file.stream) {
      await pipeline(file.stream, createWriteStream(fullPath));
    } else if (file.buffer) {
      writeFileSync(fullPath, file.buffer);
    } else if (file.path) {
      // Disk storage case — move the temp file into place
      await fsp.rename(file.path, fullPath);
    } else {
      throw new InternalServerErrorException(
        `Uploaded file has no readable body (field=${file.fieldname})`,
      );
    }
    return fullPath;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
