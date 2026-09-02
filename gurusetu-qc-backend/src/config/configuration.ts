export type LlmProviderKind = 'anthropic' | 'openai' | 'mock';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  mongoUri: string;
  uploadDir: string;
  tempDir: string;
  /** Fallback provider used only until an admin saves an LLM config in the UI. */
  llmProvider: LlmProviderKind;
  /** Seed values for the DB-backed LLM config, applied once on first boot. */
  llmSeed: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  openai: {
    apiKey: string;
    transcribeModel: string;
    analysisModel: string;
  };
  auth: {
    jwtSecret: string;
    encryptionKey: string;
    adminUsername: string;
    sessionHours: number;
    cookieSecure: boolean;
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

/**
 * LLM_PROVIDER used to accept 'minimax'. That value is still honoured and maps
 * to 'anthropic', because MiniMax speaks the Anthropic Messages protocol — the
 * distinction that actually matters is the wire format, not the vendor.
 */
const normaliseProvider = (raw: string): LlmProviderKind => {
  const v = raw.toLowerCase();
  if (v === 'minimax' || v === 'anthropic') return 'anthropic';
  if (v === 'openai') return 'openai';
  if (v === 'mock') return 'mock';
  throw new Error(`Unsupported LLM_PROVIDER: ${raw}`);
};

export const loadConfig = (): AppConfig => {
  return {
    port: parseInt(process.env.PORT ?? '4187', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    mongoUri: required('MONGODB_URI'),
    uploadDir: required('UPLOAD_DIR'),
    tempDir: required('TEMP_DIR'),
    llmProvider: normaliseProvider(process.env.LLM_PROVIDER ?? 'mock'),
    llmSeed: {
      // These are only a starting point for the DB-backed config; once an admin
      // saves settings in the UI the database is authoritative.
      baseUrl: optional('MINIMAX_BASE_URL') || optional('LLM_BASE_URL'),
      apiKey: optional('MINIMAX_API_KEY') || optional('LLM_API_KEY'),
      model: optional('MINIMAX_MODEL') || optional('LLM_MODEL'),
    },
    openai: {
      apiKey: optional('OPENAI_API_KEY'),
      transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? 'whisper-1',
      analysisModel: process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-4o-mini',
    },
    auth: {
      jwtSecret: required('JWT_SECRET'),
      encryptionKey: required('ENCRYPTION_KEY'),
      adminUsername: optional('ADMIN_USERNAME', 'admin'),
      sessionHours: parseInt(process.env.SESSION_HOURS ?? '12', 10),
      // Set COOKIE_SECURE=false only for plain-HTTP local development.
      cookieSecure: (process.env.COOKIE_SECURE ?? 'true') !== 'false',
    },
    ytDlpPath: process.env.YTDLP_PATH ?? 'yt-dlp',
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '500', 10),
    maxTranscriptChars: parseInt(process.env.MAX_TRANSCRIPT_CHARS ?? '180000', 10),
  };
};
