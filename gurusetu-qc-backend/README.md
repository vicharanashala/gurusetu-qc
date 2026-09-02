# GuruSetu QC Backend

A NestJS + TypeScript backend that audits video, audio, YouTube, and text
inputs against the GuruSetu Quality-Check rubric. Every claim in the
transcript is classified 🟢 / 🟠 / 🔴 with sources and corrections, and the
full evaluation (claims, tally, scorecard, vertical fit, citation pack) is
persisted in MongoDB so it can be revisited, re-run, or compared.

## Quick start

```bash
# 1. Start MongoDB (any port you like — defaults to 27018 here)
docker run -d --name gurusetu-mongo -p 27018:27017 \
  -v gurusetu-mongo-data:/data/db mongo:7

# 2. Install + configure
cp .env.example .env   # already filled with sane defaults for local dev
npm install

# 3. Build and run
npm run build
npm run start:prod    # listens on http://localhost:4187

# 4. Sanity check
curl http://localhost:4187/health
```

A pre-flight smoke test exercises the full pipeline end-to-end:

```bash
npm run smoke
```

It creates a text evaluation, a file-upload evaluation, submits a YouTube URL,
lists, stats, and re-runs an evaluation, asserting on the response shapes.

## Architecture

```
src/
├── main.ts                       # bootstrap, body-parser, CORS
├── app.module.ts                 # config + mongoose wiring
├── config/configuration.ts       # env loader with type-safety
├── common/
│   ├── filters/                  # uniform JSON error envelope
│   └── interceptors/             # access-log
├── evaluations/                  # REST controller + orchestration
│   ├── evaluations.controller.ts # POST /text /youtube /upload, GET, DELETE, rerun
│   ├── evaluations.service.ts    # orchestrates download → transcribe → analyze
│   ├── schemas/                  # Mongoose schema (Evaluation, ClaimItem, …)
│   └── dto/                      # input validation (class-validator)
├── youtube/                      # yt-dlp probe + audio download
├── transcription/                # auto-captions + OpenAI Whisper
├── analysis/                     # GuruSetu QC prompt + structured parser
└── llm/                          # LLM provider abstraction
```

### Data flow

```
                  ┌────────────┐
                  │ POST /text │──► persist evaluation (status=pending)
                  └────────────┘                │
                  ┌────────────────┐           ▼
                  │ POST /upload   │──► persist (status=transcribing|pending)
                  └────────────────┘           │
                  ┌────────────────┐           ▼
                  │ POST /youtube  │──► persist (status=transcribing)
                  └────────────────┘           │
                                              ▼
                      ┌───────────────────────────────────┐
                      │ background pipeline               │
                      │                                   │
                      │  text:        analyze → done      │
                      │  file_text:   analyze → done      │
                      │  audio/video: Whisper → analyze  │
                      │  youtube:     auto-subs → done   │
                      │              (else dl + Whisper) │
                      └───────────────────────────────────┘
                                              │
                                              ▼
                                  Mongoose (status, analysis,
                                  timingsMs, failureReason)
```

## API

All endpoints accept and return JSON. The error envelope is uniform:

```json
{ "success": false, "statusCode": 400, "message": "...", "path": "...", "timestamp": "..." }
```

### `POST /evaluations/text`

```json
{
  "sourceType": "text",
  "text": "<transcript>",
  "title": "optional",
  "language": "optional",
  "tags": ["pedagogy"],
  "createdBy": "optional"
}
```
Returns `202 Accepted` with `{ evaluationId, status, ... }`.

### `POST /evaluations/youtube`

```json
{
  "sourceType": "youtube",
  "url": "https://www.youtube.com/watch?v=...",
  "title": "optional",
  "tags": ["optional"],
  "createdBy": "optional"
}
```
The pipeline first attempts `yt-dlp --write-auto-subs` (fast, free). If no
captions are available, it falls back to `yt-dlp -x` (audio only) +
Whisper transcription.

### `POST /evaluations/upload`

`multipart/form-data` with:

| field        | required | description                              |
|--------------|----------|------------------------------------------|
| `file`       | yes      | audio, video, or text transcript         |
| `title`      | no       | human-readable title                     |
| `language`   | no       | hint for transcription                   |
| `createdBy`  | no       | auditor id                               |
| `tags`       | no       | comma-separated                          |

The MIME type and extension drive the source classification:

- `video/*`, `.mp4` `.mkv` `.mov` `.webm` … → `file_video`
- `audio/*`, `.mp3` `.wav` `.m4a` … → `file_audio`
- `text/*` or `.txt` `.md` `.json` `.srt` `.vtt` … → `file_text`

Audio and video files are sent to OpenAI Whisper (requires `OPENAI_API_KEY`).
Text files are persisted directly and analyzed.

### `GET /evaluations`

Query params: `status`, `sourceType`, `search`, `limit` (≤100), `offset`.

### `GET /evaluations/stats`

Returns totals, status breakdown, source-type breakdown, and the running
average `overallScore`.

### `GET /evaluations/:evaluationId`

Returns the full document including `analysis`, `transcript`, `transcriptSegments`,
`status`, `progressPercent`, `statusMessage`, `failureReason`, `timingsMs`,
`runNumber`, `parentEvaluationId`.

### `POST /evaluations/:evaluationId/rerun`

Clones the source and re-runs analysis. The new document links back via
`parentEvaluationId` and increments `runNumber`.

### `DELETE /evaluations/:evaluationId`

Removes the document and the best-effort deletes any uploaded file.

## Analysis structure

The persisted `analysis` object follows the GuruSetu QC rubric verbatim:

```ts
{
  claims: [{ index, claim, verdict, loadBearing, knownMyth,
             basis, correction?, speakerCategory? }],
  tally: { green, amber, red, total, loadBearingReds, loadBearingClaims[] },
  scorecard: { factualAccuracy, evidenceGrounding, citationHygiene,
               epistemicHygiene, pedagogicalSoundness, internalCoherence,
               deliveryCleanliness, currency?, localization?, editorialNeutrality? },
  overallScore,             // 0-10
  verdict,                  // accept-as-is | accept-with-minor-revisions
                            // | revise-before-release | blocked-on-media
  qualitativeSummary,
  requiredFixes: string[],
  citationPack: string[],
  verticalFit: { bestFit, secondary, rating, justification }
}
```

The backend enforces the threshold rules defensively (any load-bearing red or
>30 % amber ⇒ `revise-before-release`) on top of the model's own reasoning.

## LLM provider

`LLM_PROVIDER` selects the active provider. Default is `minimax` which uses the
Anthropic Messages protocol at the configured `MINIMAX_BASE_URL`. Switch to:

- `openai` — OpenAI-compatible (set `OPENAI_API_KEY` and a custom base URL).
- `mock`  — returns a deterministic echo so you can wire up pipelines without
  burning tokens.

The model is intentionally prompted to refuse to fabricate sources; unverifiable
claims are returned as `amber` rather than `green`.

## Configuration

Every key in `.env.example` is documented inline. Highlights:

| key                      | meaning                                                |
|--------------------------|--------------------------------------------------------|
| `PORT`                   | server port (default `4187`, non-standard)             |
| `MONGODB_URI`            | full Mongo connection string                           |
| `UPLOAD_DIR` / `TEMP_DIR`| disk locations for uploaded files and yt-dlp artefacts  |
| `YTDLP_PATH`             | path to the `yt-dlp` binary                            |
| `FFMPEG_PATH`            | path to `ffmpeg` (used by yt-dlp for some extractors) |
| `MAX_UPLOAD_MB`          | multer's body limit (default `500`)                    |
| `MAX_TRANSCRIPT_CHARS`   | transcript truncation limit sent to the LLM            |
| `MINIMAX_THINKING=enable`| opt-in to extended thinking (default disabled)        |

## Scripts

| command              | what it does                                  |
|----------------------|-----------------------------------------------|
| `npm run build`      | compile to `dist/`                            |
| `npm run start:prod` | run the compiled output                       |
| `npm run start:dev`  | run with watch                                |
| `npm run test`       | run jest unit tests                           |
| `npm run smoke`      | end-to-end smoke test (server must be running) |

## Known limitations

- The bundled LLM provider speaks the Anthropic Messages protocol; if you
  point it at an OpenAI-shaped endpoint, set the appropriate headers in
  `LlmService`.
- Whisper transcription requires `OPENAI_API_KEY`; without it, only the
  YouTube auto-captions path will produce a transcript for non-text inputs.
- Storage is local disk (`UPLOAD_DIR`, `TEMP_DIR`). Swap to S3 or similar by
  replacing `persistUpload` in `evaluations.service.ts`.
