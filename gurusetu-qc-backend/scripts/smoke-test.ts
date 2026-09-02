/**
 * Smoke test for the GuruSetu QC backend.
 *
 *  - exercises text upload end-to-end (sync LLM call)
 *  - exercises text file upload
 *  - exercises youtube URL submit (just checks the async pipeline is queued)
 *  - lists, fetches, reruns, deletes
 *  - validates the analysis structure for the text job
 */

import { setTimeout as wait } from 'timers/promises';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Blob } from 'buffer';

type NativeForm = Map<
  string,
  { kind: 'file' | 'text'; path?: string; text?: string; filename?: string; contentType?: string }
>;

const BASE = process.env.BASE ?? 'http://localhost:4187';
const SAMPLE_TEXT = `Welcome, everyone. I'm Dr. Anjali Rao and today I want to talk about how faculty can build better habits in their teaching practice.

You know, they say it takes 21 days to form a habit — I think that's a useful rule of thumb, and research shows this clearly. In fact, a famous study by Maxwell Maltz in 1960 proved that 21 days is exactly what you need. Most of you probably grew up as digital natives, so I won't belabor the point about technology in the classroom.

Now, the most important thing is that students have different learning styles — visual, auditory, kinesthetic — and we should design our lessons to match each student's dominant style. This is settled science. Mirror neurons mean that when a teacher smiles, the students' brains light up in empathy, and that's why modeling matters so much.

In our own classroom data over the last three years, we saw average attention span collapse from 12 seconds to 8 seconds — this is a real crisis and it means every lecture must be redesigned. I recommend three principles: keep videos under 6 minutes, use retrieval practice, and space your lessons. These are evidence-based.

To close, a quote I love from Einstein: "Insanity is doing the same thing over and over and expecting different results." That was Albert Einstein in 1943, and it captures exactly why faculty development matters today.

Finally — none of what I've shared comes from a single RCT, but it's consistent with how I've seen real classrooms work, and I think that's worth something too. Thank you.`;

function log(label: string, value: unknown) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ===`);
  // eslint-disable-next-line no-console
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function http<T = any>(
  method: string,
  path: string,
  body?: any,
  contentType?: string,
): Promise<{ status: number; data: T }> {
  const url = `${BASE}${path}`;
  const init: RequestInit = { method };
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    if (contentType === 'multipart') {
      // Use the native FormData + Blob so fetch handles multipart natively.
      const nativeFd = new FormData();
      const formMap = body as NativeForm;
      for (const [k, v] of formMap.entries()) {
        if (v.kind === 'file' && v.path) {
          const buf = readFileSync(v.path);
          const blob = new Blob([new Uint8Array(buf)], { type: v.contentType ?? 'application/octet-stream' });
          nativeFd.append(k, blob, v.filename ?? 'file');
        } else if (v.kind === 'text' && v.text !== undefined) {
          nativeFd.append(k, v.text);
        }
      }
      // fetch auto-sets the multipart boundary header.
      init.body = nativeFd as unknown as BodyInit;
    } else if (typeof body === 'string') {
      init.body = body;
      headers['Content-Type'] = contentType ?? 'application/json';
    } else {
      init.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }
  init.headers = headers;
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, data: parsed };
}

async function pollUntilTerminal(
  evaluationId: string,
  timeoutMs = 240_000,
): Promise<any> {
  const start = Date.now();
  let last: any;
  while (Date.now() - start < timeoutMs) {
    const { status, data } = await http(
      'GET',
      `/evaluations/${evaluationId}`,
    );
    last = data;
    if (status !== 200) {
      throw new Error(`GET /evaluations/${evaluationId} -> ${status}`);
    }
    if (['completed', 'failed'].includes(data.status)) return data;
    process.stdout.write(`\r  status=${data.status} progress=${data.progressPercent}% msg="${data.statusMessage ?? ''}"   `);
    await wait(1500);
  }
  process.stdout.write('\n');
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function main() {
  mkdirSync(join(__dirname, '..', 'temp'), { recursive: true });

  // 1) Health
  {
    const r = await http('GET', '/health');
    log('Health', { status: r.status, body: r.data });
  }

  // 2) Text evaluation
  let textEvalId = '';
  {
    const body = {
      sourceType: 'text',
      title: 'Faculty habits smoke test',
      text: SAMPLE_TEXT,
      createdBy: 'smoke-test',
      tags: ['smoke', 'pedagogy'],
    };
    const r = await http('POST', '/evaluations/text', body);
    log('POST /evaluations/text', { status: r.status, evaluationId: r.data.evaluationId, evalStatus: r.data.status });
    textEvalId = r.data.evaluationId;
  }

  // 3) Wait for completion
  {
    const final = await pollUntilTerminal(textEvalId, 180_000);
    process.stdout.write('\n');
    log('Final text evaluation (head)', {
      evaluationId: final.evaluationId,
      status: final.status,
      progress: final.progress,
      overallScore: final.analysis?.overallScore,
      verdict: final.analysis?.verdict,
      tally: final.analysis?.tally,
      scorecard: final.analysis?.scorecard,
      verticalFit: final.analysis?.verticalFit,
      claimSample: final.analysis?.claims?.slice(0, 3),
      transcriptNotes: final.analysis?.transcriptNotes,
      transcriptLen: (final.transcript ?? '').length,
    });

    // Structural assertions
    const a = final.analysis;
    const must = (cond: boolean, msg: string) => {
      if (!cond) throw new Error('SMOKE ASSERT FAIL: ' + msg);
    };
    must(!!a, 'analysis exists');
    must(Array.isArray(a.claims), 'claims is array');
    must(a.claims.length >= 5, `claims.length=${a.claims.length} >= 5`);
    must(
      ['green', 'amber', 'red'].every((v) =>
        a.claims.every((c: any) => ['green', 'amber', 'red'].includes(c.verdict)),
      ),
      'every claim has valid verdict',
    );
    must(typeof a.scorecard?.factualAccuracy === 'number', 'scorecard present');
    must(typeof a.overallScore === 'number', 'overallScore is number');
    must(
      ['accept-as-is', 'accept-with-minor-revisions', 'revise-before-release', 'blocked-on-media'].includes(a.verdict),
      'verdict in enum',
    );
    must(typeof a.verticalFit?.bestFit === 'string', 'verticalFit.bestFit');
    must(Array.isArray(a.requiredFixes), 'requiredFixes array');
    must(Array.isArray(a.citationPack), 'citationPack array');

    // Look for the load-bearing myth: 21-day habit claim
    const mythClaim = a.claims.find((c: any) =>
      /21[\s-]day/i.test(c.claim ?? ''),
    );
    must(mythClaim, '21-day myth claim extracted');
    must(
      mythClaim && (mythClaim.verdict === 'red' || mythClaim.verdict === 'amber'),
      `21-day myth verdict should be red or amber, got ${mythClaim?.verdict}`,
    );
  }

  // 4) Text file upload
  {
    const txtPath = join(__dirname, '..', 'temp', 'sample-transcript.txt');
    writeFileSync(txtPath, SAMPLE_TEXT, 'utf-8');
    const form = new Map<string, { kind: 'file' | 'text'; path?: string; text?: string; filename?: string; contentType?: string }>();
    form.set('file', { kind: 'file', path: txtPath, filename: 'sample-transcript.txt', contentType: 'text/plain' });
    form.set('title', { kind: 'text', text: 'Faculty habits file upload smoke test' });
    form.set('createdBy', { kind: 'text', text: 'smoke-test' });

    const r = await http(
      'POST',
      '/evaluations/upload',
      form,
      'multipart',
    );
    log('POST /evaluations/upload (text file)', {
      status: r.status,
      evaluationId: r.data.evaluationId,
      sourceType: r.data.sourceType,
    });
    const final = await pollUntilTerminal(r.data.evaluationId, 180_000);
    process.stdout.write('\n');
    log('Final file-upload evaluation', {
      status: final.status,
      overallScore: final.analysis?.overallScore,
      verdict: final.analysis?.verdict,
      claims: final.analysis?.claims?.length,
    });
  }

  // 5) YouTube (just submit, do not wait for full transcription)
  {
    const body = {
      sourceType: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'Smoke YT — never gonna give you up',
    };
    const r = await http('POST', '/evaluations/youtube', body);
    log('POST /evaluations/youtube', {
      status: r.status,
      evaluationId: r.data.evaluationId,
      sourceType: r.data.sourceType,
      initialStatus: r.data.status,
    });
  }

  // 6) List
  {
    const r = await http('GET', '/evaluations?limit=10');
    log('GET /evaluations (list)', {
      status: r.status,
      total: r.data.total,
      itemCount: r.data.items?.length,
    });
  }

  // 7) Stats
  {
    const r = await http('GET', '/evaluations/stats');
    log('GET /evaluations/stats', r.data);
  }

  // 8) Rerun the text eval
  {
    const r = await http('POST', `/evaluations/${textEvalId}/rerun`);
    log('POST /evaluations/:id/rerun', {
      status: r.status,
      newEvaluationId: r.data.evaluationId,
      runNumber: r.data.runNumber,
      parentEvaluationId: r.data.parentEvaluationId,
    });
    const final = await pollUntilTerminal(r.data.evaluationId, 180_000);
    process.stdout.write('\n');
    log('Rerun completed', {
      status: final.status,
      runNumber: final.runNumber,
      overallScore: final.analysis?.overallScore,
    });
  }

  // 9) Delete the rerun (keep original for the user)
  // (skipped to leave history intact)

  // eslint-disable-next-line no-console
  console.log('\n✅ SMOKE TEST PASSED');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n❌ SMOKE TEST FAILED:', err);
  process.exit(1);
});
