export interface AppConfig {
  port: number;
  nodeEnv: string;
  mongoUri: string;
  uploadDir: string;
  tempDir: string;
  llmProvider: 'minimax' | 'openai' | 'mock';
  minimax: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  openai: {
    apiKey: string;
    transcribeModel: string;
    analysisModel: string;
  };
  ytDlpPath: string;
  ffmpegPath: string;
  maxUploadMb: number;
  maxTranscriptChars: number;
}

const required = (name: string): string => {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
};

const optional = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export const loadConfig = (): AppConfig => {
  const provider = (process.env.LLM_PROVIDER ?? 'minimax').toLowerCase();
  if (!['minimax', 'openai', 'mock'].includes(provider)) {
    throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }

  return {
    port: parseInt(process.env.PORT ?? '4187', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    mongoUri: required('MONGODB_URI'),
    uploadDir: required('UPLOAD_DIR'),
    tempDir: required('TEMP_DIR'),
    llmProvider: provider as AppConfig['llmProvider'],
    minimax: {
      baseUrl: required('MINIMAX_BASE_URL'),
      apiKey: required('MINIMAX_API_KEY'),
      model: process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
    },
    openai: {
      apiKey: optional('OPENAI_API_KEY'),
      transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1',
      analysisModel: process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-4o-mini',
    },
    ytDlpPath: process.env.YTDLP_PATH ?? 'yt-dlp',
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '500', 10),
    maxTranscriptChars: parseInt(process.env.MAX_TRANSCRIPT_CHARS ?? '180000', 10),
  };
};
