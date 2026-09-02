import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { promises as fsp, createReadStream } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import FormData from 'form-data';
import { Readable } from 'stream';
import { YoutubeService } from '../youtube/youtube.service';

export interface TranscriptSegment {
  text: string;
  startSec?: number;
  endSec?: number;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  engine: 'openai-whisper' | 'yt-auto-subs' | 'manual';
  language?: string;
  durationSec?: number;
}

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly youtube: YoutubeService,
  ) {}

  /**
   * Fast path: try to fetch auto-generated captions for a YouTube URL.
   * Returns null when no captions are available.
   */
  async tryYoutubeCaptions(
    youtubeUrl: string,
    videoId: string,
  ): Promise<TranscriptResult | null> {
    const tempDir = this.config.get('tempDir', { infer: true }) as string;
    const bin = this.config.get('ytDlpPath', { infer: true }) as string;

    const outTemplate = join(tempDir, `${videoId}-${randomUUID()}.%(ext)s`);
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--write-auto-subs',
      '--write-subs',
      '--sub-langs',
      'en.*,en',
      '--sub-format',
      'vtt/srv1/srv2/srv3/best',
      '--convert-subs',
      'vtt',
      '-o',
      outTemplate,
      youtubeUrl,
    ];

    try {
      await this.runCaptionsProbe(bin, args);
    } catch (err) {
      this.logger.warn(
        `yt-dlp captions probe failed: ${(err as Error).message}`,
      );
      return null;
    }

    const vttPath = await this.findFile(tempDir, videoId, ['vtt']);
    if (!vttPath) return null;

    const vtt = await fsp.readFile(vttPath, 'utf-8');
    const parsed = this.parseVtt(vtt);

    // cleanup
    fsp.unlink(vttPath).catch(() => undefined);

    if (!parsed.segments.length) return null;
    const text = parsed.segments.map((s) => s.text).join(' ');
    return {
      text,
      segments: parsed.segments,
      engine: 'yt-auto-subs',
      language: parsed.language,
    };
  }

  /**
   * Transcribe an arbitrary audio/video file using OpenAI Whisper if available.
   */
  async transcribeFile(
    filePath: string,
    options: { language?: string } = {},
  ): Promise<TranscriptResult> {
    const apiKey = this.config.get('openai.apiKey', { infer: true });
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Audio/video transcription requires OPENAI_API_KEY. Set it in .env or provide a YouTube URL (auto-captions will be used).',
      );
    }
    const model = this.config.get('openai.transcribeModel', {
      infer: true,
    }) as string;

    const form = new FormData();
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('file', createReadStream(filePath), {
      filename: filePath.split('/').pop(),
      contentType: 'application/octet-stream',
      knownLength: undefined,
    });
    if (options.language) form.append('language', options.language);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      ...(form.getHeaders() as Record<string, string>),
    };

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers,
      body: form.getBuffer() as unknown as BodyInit,
    });

    if (!res.ok) {
      const t = await res.text();
      throw new InternalServerErrorException(
        `Whisper transcription failed (${res.status}): ${t.slice(0, 400)}`,
      );
    }
    const data = (await res.json()) as Record<string, any>;
    const segments: TranscriptSegment[] = (data.segments ?? []).map(
      (s: any) => ({
        text: String(s.text ?? '').trim(),
        startSec: typeof s.start === 'number' ? s.start : undefined,
        endSec: typeof s.end === 'number' ? s.end : undefined,
      }),
    );
    const text =
      typeof data.text === 'string' && data.text.trim().length > 0
        ? data.text
        : segments.map((s) => s.text).join(' ');

    return {
      text,
      segments,
      engine: 'openai-whisper',
      language: data.language,
      durationSec: data.duration,
    };
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath);
    } catch {
      /* ignore */
    }
  }

  private async streamFromDisk(filePath: string): Promise<Readable> {
    return createReadStream(filePath);
  }

  private async findFile(
    dir: string,
    prefix: string,
    exts: string[],
  ): Promise<string | null> {
    const files = await fsp.readdir(dir);
    for (const f of files) {
      if (!f.startsWith(prefix)) continue;
      const ext = f.split('.').pop()?.toLowerCase();
      if (ext && exts.includes(ext)) return join(dir, f);
    }
    return null;
  }

  private runCaptionsProbe(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('yt-dlp captions probe timed out'));
      }, 90_000);
      child.stderr.on('data', (b) => (stderr += b.toString()));
      child.on('close', (code) => {
        clearTimeout(timer);
        // yt-dlp returns non-zero when no subs are available
        resolve();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private parseVtt(vtt: string): {
    segments: TranscriptSegment[];
    language?: string;
  } {
    const languageMatch = vtt.match(/Language:\s*(\S+)/i);
    const language = languageMatch?.[1];
    // Normalize line endings, drop WEBVTT header and metadata
    const blocks = vtt
      .replace(/\r\n/g, '\n')
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0 && !b.startsWith('WEBVTT') && !b.startsWith('NOTE'));

    const segments: TranscriptSegment[] = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const timeLine = lines.find((l) => l.includes('-->'));
      if (!timeLine) continue;
      const m = /(\d{2}:)?(\d{2}):(\d{2})\.(\d{3})\s+-->(\s+(\d{2}:)?(\d{2}):(\d{2})\.(\d{3}))?/.exec(
        timeLine,
      );
      if (!m) continue;
      const startSec = this.toSec(m[1], m[2], m[3], m[4]);
      const text = lines
        .slice(lines.indexOf(timeLine) + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;
      segments.push({ text, startSec });
    }
    return { segments, language };
  }

  private toSec(
    h: string | undefined,
    m: string,
    s: string,
    ms: string,
  ): number {
    const hh = h ? parseInt(h.replace(':', ''), 10) : 0;
    return hh * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(ms, 10) / 1000;
  }
}
