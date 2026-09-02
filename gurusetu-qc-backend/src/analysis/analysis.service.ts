import {
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LlmService } from '../llm/llm.service';
// Bundled default lives in prompts/gurusetu-qc.prompt.ts — kept as a fallback
// reference; the runtime prompt comes from PromptsService (MongoDB-backed).
import { PromptsService } from '../prompts/prompts.service';
import {
  AnalysisResult,
  ClaimItem,
  ClaimVerdict,
  Scorecard,
  Tally,
  VerticalFit,
} from '../evaluations/schemas/evaluation.schema';

const ALLOWED_VERDICTS: string[] = ['green', 'amber', 'red'];

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly llm: LlmService,
    private readonly prompts: PromptsService,
  ) {}

  async analyze(
    transcript: string,
    options: {
      title?: string;
      verticalHint?: string;
      language?: string;
    } = {},
  ): Promise<AnalysisResult> {
    const maxChars = this.config.get('maxTranscriptChars', {
      infer: true,
    }) as number;
    if (!transcript || transcript.trim().length < 40) {
      throw new PayloadTooLargeException(
        'Transcript too short (<40 chars) for meaningful analysis.',
      );
    }
    const trimmed = transcript.length > maxChars
      ? `${transcript.slice(0, maxChars)}\n\n[... transcript truncated for analysis ...]`
      : transcript;

    const userPrompt = this.buildUserPrompt(trimmed, options);

    // Always pull the active prompt fresh — it's tiny and any prompt edit
    // should reflect immediately on the next evaluation.
    const active = await this.prompts.getActive();

    const result = await this.llm.chat(
      [
        { role: 'system', content: active.content },
        { role: 'user', content: userPrompt },
      ],
      {
        temperature: 0.2,
        maxTokens: 16000,
        json: true,
      },
    );

    const parsed = this.parseAndValidate(result.content, transcript.length);

    // Enforce threshold rules defensively — the LLM is told to do this, but we
    // recompute it so the persisted result is always consistent.
    return this.enforceThresholds(parsed);
  }

  private buildUserPrompt(
    transcript: string,
    opts: { title?: string; verticalHint?: string; language?: string },
  ): string {
    const lines: string[] = [];
    lines.push('## Transcript to audit');
    if (opts.title) lines.push(`Title hint: ${opts.title}`);
    if (opts.verticalHint) lines.push(`Vertical hint: ${opts.verticalHint}`);
    if (opts.language) lines.push(`Language: ${opts.language}`);
    lines.push('');
    lines.push('```');
    lines.push(transcript);
    lines.push('```');
    lines.push('');
    lines.push(
      'Respond with ONLY the JSON object described in the system prompt — no markdown fences, no commentary.',
    );
    return lines.join('\n');
  }

  private parseAndValidate(raw: string, originalLength: number): AnalysisResult {
    const cleaned = this.extractJson(raw);
    let obj: any;
    try {
      obj = JSON.parse(cleaned);
    } catch (err) {
      this.logger.error(
        `LLM did not return valid JSON. Raw head: ${raw.slice(0, 300)}`,
      );
      throw new Error(
        `Analysis LLM returned non-JSON (${(err as Error).message}). Raw head: ${raw.slice(0, 200)}`,
      );
    }

    const claimsIn = Array.isArray(obj.claims) ? obj.claims : [];
    const claims: ClaimItem[] = claimsIn.map((c: any, i: number) => {
      const v = String(c.verdict ?? 'amber').toLowerCase();
      const verdict: ClaimVerdict = ALLOWED_VERDICTS.includes(v)
        ? (v as ClaimVerdict)
        : ClaimVerdict.AMBER;
      return {
        index: typeof c.index === 'number' ? c.index : i + 1,
        claim: String(c.claim ?? '').trim(),
        verdict,
        loadBearing: Boolean(c.loadBearing),
        knownMyth: Boolean(c.knownMyth),
        basis: String(c.basis ?? '').trim(),
        correction: c.correction ? String(c.correction) : undefined,
        speakerCategory: c.speakerCategory
          ? String(c.speakerCategory)
          : undefined,
      };
    });

    const tally: Tally = this.recomputeTally(claims, obj.tally);

    const scorecard: Scorecard = this.normalizeScorecard(obj.scorecard);

    const verticalFit: VerticalFit = {
      bestFit: String(obj.verticalFit?.bestFit ?? 'Pedagogy & Curriculum'),
      secondary: String(obj.verticalFit?.secondary ?? 'Faculty Wellbeing'),
      rating: String(obj.verticalFit?.rating ?? '★★★'),
      justification: String(
        obj.verticalFit?.justification ?? 'No justification provided.',
      ),
    };

    const overallScore = this.clampNumber(obj.overallScore, 0, 10, this.deriveOverall(scorecard));

    let verdict = String(obj.verdict ?? '').toLowerCase();
    if (!['accept-as-is', 'accept-with-minor-revisions', 'revise-before-release', 'blocked-on-media'].includes(verdict)) {
      verdict = this.deriveVerdictFromScore(overallScore);
    }

    return {
      claims,
      tally,
      scorecard,
      overallScore,
      verdict,
      qualitativeSummary: obj.qualitativeSummary
        ? String(obj.qualitativeSummary)
        : undefined,
      requiredFixes: Array.isArray(obj.requiredFixes)
        ? obj.requiredFixes.map(String)
        : [],
      citationPack: Array.isArray(obj.citationPack)
        ? obj.citationPack.map(String)
        : [],
      verticalFit,
    };
  }

  private extractJson(raw: string): string {
    let s = raw.trim();
    // strip ``` fences if the model wrapped it
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const first = s.indexOf('{');
    if (first < 0) return s;
    const last = s.lastIndexOf('}');
    if (last > first) {
      return s.slice(first, last + 1);
    }
    // JSON was truncated mid-stream — try to close it so partial claims still parse.
    let truncated = s.slice(first);
    // Drop any incomplete trailing string literal
    truncated = truncated.replace(/,\s*"[^"\n]*$/, '');
    truncated = truncated.replace(/:\s*"[^"\n]*$/, ':""');
    // Close any unclosed brackets/braces
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let i = 0; i < truncated.length; i++) {
      const ch = truncated[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        else if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') stack.pop();
      }
    }
    while (stack.length > 0) truncated += stack.pop();
    return truncated;
  }

  private recomputeTally(claims: ClaimItem[], rawTally: any): Tally {
    let green = 0;
    let amber = 0;
    let red = 0;
    let lbReds = 0;
    const lbClaims: string[] = [];
    for (const c of claims) {
      if (c.verdict === ClaimVerdict.GREEN) green++;
      else if (c.verdict === ClaimVerdict.AMBER) amber++;
      else if (c.verdict === ClaimVerdict.RED) {
        red++;
        if (c.loadBearing) {
          lbReds++;
          lbClaims.push(`#${c.index} ${c.claim.slice(0, 80)}`);
        }
      }
    }
    return {
      green,
      amber,
      red,
      total: claims.length,
      loadBearingReds: lbReds,
      loadBearingClaims: lbClaims,
    };
  }

  private normalizeScorecard(raw: any): Scorecard {
    const pick = (v: any, fallback: number): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, Math.min(10, n));
    };
    return {
      factualAccuracy: pick(raw?.factualAccuracy, 5),
      evidenceGrounding: pick(raw?.evidenceGrounding, 5),
      citationHygiene: pick(raw?.citationHygiene, 5),
      epistemicHygiene: pick(raw?.epistemicHygiene, 5),
      pedagogicalSoundness: pick(raw?.pedagogicalSoundness, 5),
      internalCoherence: pick(raw?.internalCoherence, 5),
      deliveryCleanliness: pick(raw?.deliveryCleanliness, 5),
      currency: raw?.currency != null ? pick(raw.currency, 5) : undefined,
      localization:
        raw?.localization != null ? pick(raw.localization, 5) : undefined,
      editorialNeutrality:
        raw?.editorialNeutrality != null
          ? pick(raw.editorialNeutrality, 5)
          : undefined,
    };
  }

  private deriveOverall(scorecard: Scorecard): number {
    const core = [
      scorecard.factualAccuracy,
      scorecard.evidenceGrounding,
      scorecard.citationHygiene,
      scorecard.epistemicHygiene,
      scorecard.pedagogicalSoundness,
      scorecard.internalCoherence,
      scorecard.deliveryCleanliness,
    ].filter((n): n is number => typeof n === 'number');
    const sum = core.reduce((a, b) => a + b, 0);
    return Math.round((sum / core.length) * 10) / 10;
  }

  private deriveVerdictFromScore(score: number): string {
    if (score >= 8.5) return 'accept-as-is';
    if (score >= 7) return 'accept-with-minor-revisions';
    if (score >= 4) return 'revise-before-release';
    return 'blocked-on-media';
  }

  private clampNumber(
    v: any,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
  }

  private enforceThresholds(result: AnalysisResult): AnalysisResult {
    const { tally } = result;
    const amberPct = tally.total > 0 ? tally.amber / tally.total : 0;
    let verdict = result.verdict;
    if (tally.loadBearingReds > 0) {
      verdict = 'revise-before-release';
    } else if (amberPct > 0.3) {
      verdict = 'revise-before-release';
    }
    return { ...result, verdict };
  }
}
