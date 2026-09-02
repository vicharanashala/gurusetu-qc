// Mirrors the backend EvaluationDocument shape.

export type EvaluationStatus =
  | "pending"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "failed"

export type EvaluationSourceType =
  | "text"
  | "file_audio"
  | "file_video"
  | "file_text"
  | "youtube"

export type ClaimVerdict = "green" | "amber" | "red"

export interface ClaimItem {
  index: number
  claim: string
  verdict: ClaimVerdict
  loadBearing: boolean
  knownMyth: boolean
  basis: string
  correction?: string
  speakerCategory?: string
}

export interface Tally {
  green: number
  amber: number
  red: number
  total: number
  loadBearingReds: number
  loadBearingClaims: string[]
}

export interface Scorecard {
  factualAccuracy: number
  evidenceGrounding: number
  citationHygiene: number
  epistemicHygiene: number
  pedagogicalSoundness: number
  internalCoherence: number
  deliveryCleanliness: number
  currency?: number
  localization?: number
  editorialNeutrality?: number
}

export interface VerticalFit {
  bestFit: string
  secondary: string
  rating: string
  justification: string
}

export type OverallVerdict =
  | "accept-as-is"
  | "accept-with-minor-revisions"
  | "revise-before-release"
  | "blocked-on-media"

export interface AnalysisResult {
  claims: ClaimItem[]
  tally: Tally
  scorecard: Scorecard
  overallScore: number
  verdict: OverallVerdict
  qualitativeSummary?: string
  requiredFixes: string[]
  citationPack: string[]
  verticalFit: VerticalFit
}

export interface SourceInfo {
  type: EvaluationSourceType
  originalFilename?: string
  mimeType?: string
  sizeBytes?: number
  storedPath?: string
  url?: string
  youtubeId?: string
  youtubeTitle?: string
  youtubeChannel?: string
  youtubeDurationSec?: number
}

export interface Evaluation {
  evaluationId: string
  title: string
  sourceType: EvaluationSourceType
  source: SourceInfo
  status: EvaluationStatus
  progress: number
  progressPercent?: number
  statusMessage?: string
  transcript?: string
  transcriptSegments?: { text: string; startSec?: number; endSec?: number }[]
  transcriptEngine?: string
  transcriptLanguage?: string
  transcriptDurationSec?: number
  analysis?: AnalysisResult
  analysisEngine?: string
  analysisModel?: string
  analysisPromptVersion?: string
  runNumber: number
  parentEvaluationId?: string
  tags?: string[]
  createdBy?: string
  failureReason?: string
  timingsMs?: Record<string, number>
  createdAt: string
  updatedAt: string
}

export interface ListResponse {
  total: number
  limit: number
  offset: number
  items: Evaluation[]
}

export interface StatsResponse {
  total: number
  byStatus: Record<string, number>
  bySourceType: Record<string, number>
  averageScore: number | null
}

export const SOURCE_LABELS: Record<EvaluationSourceType, string> = {
  text: "Text",
  file_audio: "Audio",
  file_video: "Video",
  file_text: "Text file",
  youtube: "YouTube",
}

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  pending: "Pending",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  completed: "Completed",
  failed: "Failed",
}

export const VERDICT_LABELS: Record<OverallVerdict, string> = {
  "accept-as-is": "Accept as-is",
  "accept-with-minor-revisions": "Accept with minor revisions",
  "revise-before-release": "Revise before release",
  "blocked-on-media": "Blocked on media",
}
