import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { loadConfig } from '../src/config/configuration';
import { AnalysisService } from '../src/analysis/analysis.service';
import { LlmService } from '../src/llm/llm.service';

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.MONGODB_URI = 'mongodb://localhost:27018/test';
    process.env.UPLOAD_DIR = '/tmp/uploads-test';
    process.env.TEMP_DIR = '/tmp/temp-test';
    process.env.MINIMAX_BASE_URL = 'http://localhost';
    process.env.MINIMAX_API_KEY = 'mock';
    process.env.MINIMAX_MODEL = 'mock';

    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => loadConfig()],
        }),
      ],
      providers: [AnalysisService, LlmService, ConfigService],
    }).compile();

    service = mod.get(AnalysisService);
  });

  it('rejects transcripts that are too short', async () => {
    await expect(service.analyze('too short')).rejects.toThrow(/Transcript too short/);
  });

  it('parses valid JSON from the LLM and produces a structured AnalysisResult', async () => {
    const sample = 'a '.repeat(80); // > 40 chars
    const fakeLlmJson = JSON.stringify({
      claims: [
        {
          index: 1,
          claim: 'X is true.',
          verdict: 'green',
          loadBearing: false,
          knownMyth: false,
          basis: 'OK',
        },
        {
          index: 2,
          claim: 'Y is true.',
          verdict: 'red',
          loadBearing: true,
          knownMyth: true,
          basis: 'No it is not.',
          correction: 'Z is true.',
        },
      ],
      tally: { green: 1, amber: 0, red: 1, total: 2, loadBearingReds: 1 },
      scorecard: {
        factualAccuracy: 6,
        evidenceGrounding: 5,
        citationHygiene: 4,
        epistemicHygiene: 7,
        pedagogicalSoundness: 8,
        internalCoherence: 9,
        deliveryCleanliness: 10,
      },
      overallScore: 7,
      verdict: 'accept-with-minor-revisions',
      qualitativeSummary: 'ok',
      requiredFixes: ['fix #2'],
      citationPack: ['ref1', 'ref2'],
      verticalFit: {
        bestFit: 'Pedagogy & Curriculum',
        secondary: 'Faculty Wellbeing',
        rating: '★★★',
        justification: 'mid',
      },
    });

    // Monkey-patch the LLM service to return our canned JSON.
    const llm = (service as any).llm as LlmService;
    const original = llm.chat.bind(llm);
    (llm as any).chat = async () => ({ content: fakeLlmJson, provider: 'mock', model: 'mock' });

    try {
      const result = await service.analyze(sample);
      expect(result.claims.length).toBe(2);
      expect(result.tally.green).toBe(1);
      expect(result.tally.red).toBe(1);
      expect(result.tally.total).toBe(2);
      expect(result.tally.loadBearingReds).toBe(1);
      expect(result.overallScore).toBeGreaterThan(0);
      // Load-bearing red -> server should escalate verdict
      expect(result.verdict).toBe('revise-before-release');
      expect(result.verticalFit.bestFit).toBe('Pedagogy & Curriculum');
    } finally {
      (llm as any).chat = original;
    }
  });

  it('repairs truncated JSON gracefully', async () => {
    const sample = 'a '.repeat(80);
    const truncated = `{"claims":[{"index":1,"claim":"hello","verdict":"green","basis":"ok","loadBearing":false}],"tally":{"green":1,"amber":0,"red":0,"total":1},"scorecard":{"factualAccuracy":7,"evidenceGrounding":7,"citationHygiene":7,"epistemicHygiene":7,"pedagogicalSoundness":7,"internalCoherence":7,"deliveryCleanliness":7},"overallScore":7,"verdict":"accept-as-is","verticalFit":{"bestFit":"Pedagogy & Curriculum","secondary":"Faculty Wellbeing","rating":"★★★","justification":"ok"}}`;

    const llm = (service as any).llm as LlmService;
    const original = llm.chat.bind(llm);
    (llm as any).chat = async () => ({ content: truncated, provider: 'mock', model: 'mock' });

    try {
      const result = await service.analyze(sample);
      expect(result.claims.length).toBeGreaterThanOrEqual(1);
    } finally {
      (llm as any).chat = original;
    }
  });
});
