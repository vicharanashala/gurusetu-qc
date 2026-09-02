import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { promises as fsp, createWriteStream } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';

export interface YoutubeMeta {
  id: string;
  title: string;
  channel: string;
  durationSec: number;
  webpageUrl: string;
}

export interface YoutubeDownloadResult {
  meta: YoutubeMeta;
  audioPath: string;
  rawJsonPath?: string;
}

const URL_RE =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([\w-]{11})/i;

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  extractVideoId(url: string): string {
    const m = URL_RE.exec(url);
    if (!m) {
      throw new InternalServerErrorException(
        `Could not extract YouTube video id from URL: ${url}`,
      );
    }
    return m[1];
  }

  async probe(url: string): Promise<YoutubeMeta> {
    const bin = this.config.get('ytDlpPath', { infer: true }) as string;
    const args = [
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--dump-single-json',
      url,
    ];
    try {
      const { stdout } = await this.run(bin, args, 90_000);
      const json = JSON.parse(stdout);
      return {
        id: json.id,
        title: json.title,
        channel: json.channel ?? json.uploader ?? 'unknown',
        durationSec: Number(json.duration ?? 0),
        webpageUrl: json.webpage_url ?? url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `yt-dlp probe failed: ${msg.slice(0, 400)}`,
      );
    }
  }

  async downloadAudio(
    url: string,
    videoId: string,
  ): Promise<YoutubeDownloadResult> {
    const tempDir = this.config.get('tempDir', { infer: true }) as string;
    const bin = this.config.get('ytDlpPath', { infer: true }) as string;

    const outTemplate = join(tempDir, `${videoId}-${randomUUID()}.%(ext)s`);

    const args = [
      '--no-warnings',
      '--no-playlist',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '5',
      '-o',
      outTemplate,
      '--write-info-json',
      url,
    ];

    try {
      await this.run(bin, args, 5 * 60_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `yt-dlp download failed: ${msg.slice(0, 400)}`,
      );
    }

    const audioPath = await this.resolveProducedFile(tempDir, videoId, [
      'mp3',
      'm4a',
      'opus',
      'webm',
      'wav',
    ]);

    let rawJsonPath: string | undefined;
    try {
      const candidates = await fsp.readdir(tempDir);
      const infoFile = candidates.find(
        (f) => f.startsWith(videoId) && f.endsWith('.info.json'),
      );
      if (infoFile) rawJsonPath = join(tempDir, infoFile);
    } catch {
      /* ignore */
    }

    const meta = await this.probe(url);
    return { meta, audioPath, rawJsonPath };
  }

  private async resolveProducedFile(
    dir: string,
    prefix: string,
    allowedExts: string[],
  ): Promise<string> {
    const files = await fsp.readdir(dir);
    const matches = files
      .filter((f) => f.startsWith(prefix))
      .filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase();
        return ext ? allowedExts.includes(ext) : false;
      })
      .map((f) => ({ f, mtime: 0 }))
      .sort((a, b) => a.f.localeCompare(b.f));
    if (matches.length === 0) {
      throw new InternalServerErrorException(
        `yt-dlp produced no audio file matching ${prefix}.* in ${dir}`,
      );
    }
    return join(dir, matches[matches.length - 1].f);
  }

  private run(
    bin: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process') as typeof import('child_process');
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`yt-dlp timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on('data', (b) => (stdout += b.toString()));
      child.stderr.on('data', (b) => (stderr += b.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr, code: code ?? 0 });
        else reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-400)}`));
      });
    });
  }
}
