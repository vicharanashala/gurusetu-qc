import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import { ClaimVerdict, EvaluationDocument } from './schemas/evaluation.schema';

/**
 * Renders a completed evaluation as a self-contained PDF: everything the
 * detail page shows across its four tabs (overview, claims, scorecard,
 * transcript), laid out for print rather than for the screen.
 *
 * Built on pdfkit so it needs no headless browser on the server.
 */

const PAGE = { size: 'A4' as const, margin: 48 };

const COLOR = {
  text: '#111827',
  muted: '#6b7280',
  rule: '#e5e7eb',
  panel: '#f3f4f6',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
  brand: '#4f46e5',
};

const VERDICT_LABELS: Record<string, string> = {
  'accept-as-is': 'Accept as-is',
  'accept-with-minor-revisions': 'Accept with minor revisions',
  'revise-before-release': 'Revise before release',
  'blocked-on-media': 'Blocked on media',
};

const SOURCE_LABELS: Record<string, string> = {
  text: 'Text',
  file_audio: 'Audio',
  file_video: 'Video',
  file_text: 'Text file',
  youtube: 'YouTube',
};

// Same axis order and rubric wording as the scorecard panel in the UI.
const AXES: Array<{ key: string; label: string; description: string }> = [
  { key: 'factualAccuracy', label: 'Factual accuracy', description: 'Are the claims true against the best available evidence?' },
  { key: 'evidenceGrounding', label: 'Evidence grounding', description: 'Are claims tied to named studies, data or authorities?' },
  { key: 'citationHygiene', label: 'Citation hygiene', description: 'Attribution quality — misattribution is worse than none.' },
  { key: 'epistemicHygiene', label: 'Epistemic hygiene', description: 'Are opinions and uncertainty labelled as such?' },
  { key: 'pedagogicalSoundness', label: 'Pedagogical soundness', description: 'Does the teaching approach hold up as instruction?' },
  { key: 'internalCoherence', label: 'Internal coherence', description: 'Does the argument stay consistent with itself?' },
  { key: 'deliveryCleanliness', label: 'Delivery cleanliness', description: 'Clarity of delivery, free of garbles and lost sections.' },
  { key: 'currency', label: 'Currency', description: 'Is the material up to date? Situational — may be unscored.' },
  { key: 'localization', label: 'Localization', description: 'Fit for the local context. Situational — may be unscored.' },
  { key: 'editorialNeutrality', label: 'Editorial neutrality', description: 'Free of undue bias. Situational — may be unscored.' },
];

/**
 * pdfkit's built-in Helvetica is WinAnsi-only, so transliterated Sanskrit
 * (indriyāṇi, ātman) and any other non-Latin-1 text renders as garbage. DejaVu
 * Sans ships with the OS and covers Latin Extended, IPA diacritics, Greek and
 * Cyrillic. Fall back to Helvetica only if the system font is missing.
 */
const FONT_DIR = '/usr/share/fonts/truetype/dejavu';
/**
 * Each face tries its files in order, then a pdfkit built-in (always present).
 * DejaVuSans-Oblique ships in fonts-dejavu-extra, which this server lacks, so
 * Italic falls back to upright DejaVu Sans — losing the slant is better than
 * losing diacritics. (The old fallback registered a *file* called 'Italic',
 * so every report with an unscored axis 500'd with ENOENT.)
 */
const FONTS: Record<string, { files: string[]; builtin: string }> = {
  Body: { files: [`${FONT_DIR}/DejaVuSans.ttf`], builtin: 'Helvetica' },
  Bold: { files: [`${FONT_DIR}/DejaVuSans-Bold.ttf`], builtin: 'Helvetica-Bold' },
  Italic: {
    files: [`${FONT_DIR}/DejaVuSans-Oblique.ttf`, `${FONT_DIR}/DejaVuSans.ttf`],
    builtin: 'Helvetica-Oblique',
  },
};

function registerFonts(pdf: PDFKit.PDFDocument) {
  for (const [name, { files, builtin }] of Object.entries(FONTS)) {
    const file = files.find((f) => existsSync(f));
    pdf.registerFont(name, file ?? builtin);
  }
}

const toneFor = (v: number) =>
  v >= 7.5 ? COLOR.green : v >= 5 ? COLOR.amber : COLOR.red;

const verdictColor = (v: ClaimVerdict | string) =>
  v === 'green' ? COLOR.green : v === 'amber' ? COLOR.amber : COLOR.red;

@Injectable()
export class ReportPdfService {
  /** File name the browser should save the download as. */
  fileNameFor(doc: EvaluationDocument): string {
    const slug = (doc.title || 'evaluation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return `gurusetu-qc-${slug || 'evaluation'}-${doc.evaluationId.slice(0, 8)}.pdf`;
  }

  /** Renders the whole report into a single Buffer. */
  render(doc: EvaluationDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({
        size: PAGE.size,
        margin: PAGE.margin,
        bufferPages: true,
        info: {
          Title: `GuruSetu QC report — ${doc.title}`,
          Author: 'GuruSetu Quality Check',
          Subject: doc.evaluationId,
          CreationDate: new Date(),
        },
      });
      registerFonts(pdf);
      const chunks: Buffer[] = [];
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);

      try {
        new ReportWriter(pdf, doc).write();
      } catch (err) {
        reject(err);
        return;
      }
      pdf.end();
    });
  }
}

/* ============================== Layout ============================== */

class ReportWriter {
  private readonly width: number;
  private readonly left: number;

  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    private readonly e: EvaluationDocument,
  ) {
    this.left = PAGE.margin;
    this.width = pdf.page.width - PAGE.margin * 2;
  }

  write() {
    const a = this.e.analysis;
    this.header();
    if (!a) {
      this.paragraph(
        this.e.status === 'failed'
          ? `Evaluation failed: ${this.e.failureReason ?? 'unknown failure reason'}`
          : 'No analysis is available for this evaluation yet.',
        COLOR.muted,
      );
      this.footer();
      return;
    }

    this.overview();
    this.sectionBreak();
    this.scorecard();
    this.sectionBreak();
    this.claims();
    this.transcript();
    this.footer();
  }

  /* ----- Sections ----- */

  private header() {
    const { pdf, e } = this;
    pdf
      .fillColor(COLOR.brand)
      .font('Bold')
      .fontSize(10)
      .text('GURUSETU QUALITY CHECK', { characterSpacing: 1 });
    pdf.moveDown(0.4);
    pdf.fillColor(COLOR.text).font('Bold').fontSize(20).text(e.title);
    pdf.moveDown(0.3);

    const meta = [
      SOURCE_LABELS[e.sourceType] ?? e.sourceType,
      `created ${fmtDate((e as any).createdAt)}`,
      e.runNumber > 1 ? `run #${e.runNumber}` : null,
      e.analysisModel ? `analysed by ${e.analysisModel}` : null,
      `id ${e.evaluationId}`,
    ]
      .filter(Boolean)
      .join('  ·  ');
    pdf.fillColor(COLOR.muted).font('Body').fontSize(9).text(meta);

    if (e.source?.url) {
      pdf.moveDown(0.2).text(`Source: ${e.source.url}`, { link: e.source.url });
    } else if (e.source?.originalFilename) {
      pdf.moveDown(0.2).text(`Source file: ${e.source.originalFilename}`);
    }
    if (e.tags?.length) {
      pdf.moveDown(0.2).text(`Tags: ${e.tags.join(', ')}`);
    }
    this.rule();
  }

  private overview() {
    const { pdf } = this;
    const a = this.e.analysis!;
    this.h2('Overview');

    // Three summary panels side by side: score, tally, vertical fit.
    const gap = 12;
    const colW = (this.width - gap * 2) / 3;
    const top = pdf.y;
    const panelH = 128;

    // Score panel
    let x = this.left;
    this.panel(x, top, colW, panelH);
    pdf.fillColor(COLOR.muted).font('Body').fontSize(8).text('OVERALL SCORE', x + 12, top + 10);
    pdf.fillColor(toneFor(a.overallScore)).font('Bold').fontSize(30)
      .text(a.overallScore.toFixed(1), x + 12, top + 24, { continued: true });
    pdf.fillColor(COLOR.muted).font('Body').fontSize(11).text('  / 10');
    this.bar(x + 12, top + 66, colW - 24, a.overallScore / 10, toneFor(a.overallScore));
    pdf.fillColor(COLOR.text).font('Bold').fontSize(8.5)
      .text(VERDICT_LABELS[a.verdict] ?? a.verdict, x + 12, top + 78, { width: colW - 24 });
    // Verdict may wrap to two lines in the narrow column; flow the next line
    // from wherever it ended instead of a fixed offset.
    pdf.fillColor(COLOR.muted).font('Body').fontSize(8)
      .text(`${a.tally.total} claims audited`, x + 12, pdf.y + 4, { width: colW - 24 });

    // Tally panel
    x = this.left + colW + gap;
    this.panel(x, top, colW, panelH);
    pdf.fillColor(COLOR.muted).font('Body').fontSize(8).text('CLAIM TALLY', x + 12, top + 10);
    const total = Math.max(a.tally.total, 1);
    const rows: Array<[string, number, string]> = [
      ['Green', a.tally.green, COLOR.green],
      ['Amber', a.tally.amber, COLOR.amber],
      ['Red', a.tally.red, COLOR.red],
    ];
    let ry = top + 26;
    for (const [label, n, color] of rows) {
      pdf.fillColor(COLOR.text).font('Body').fontSize(9).text(label, x + 12, ry, { width: 50 });
      pdf.fillColor(color).font('Bold').fontSize(9)
        .text(`${n}`, x + colW - 60, ry, { width: 22, align: 'right' });
      pdf.fillColor(COLOR.muted).font('Body').fontSize(8)
        .text(`${Math.round((n / total) * 100)}%`, x + colW - 36, ry, { width: 24, align: 'right' });
      this.bar(x + 12, ry + 13, colW - 24, n / total, color, 3);
      ry += 24;
    }
    if (a.tally.loadBearingReds > 0) {
      pdf.fillColor(COLOR.red).font('Bold').fontSize(8)
        .text(`${a.tally.loadBearingReds} load-bearing red claim${a.tally.loadBearingReds > 1 ? 's' : ''}`, x + 12, ry + 2, { width: colW - 24 });
    }

    // Vertical fit panel
    x = this.left + (colW + gap) * 2;
    this.panel(x, top, colW, panelH);
    pdf.fillColor(COLOR.muted).font('Body').fontSize(8).text('VERTICAL FIT', x + 12, top + 10);
    const fit = a.verticalFit ?? ({} as any);
    pdf.fillColor(COLOR.text).font('Bold').fontSize(9).text('Best fit', x + 12, top + 26);
    pdf.font('Body').fontSize(9).text(fit.bestFit ?? '—', x + 12, top + 38, { width: colW - 24 });
    pdf.font('Bold').fontSize(9).text('Secondary', x + 12, top + 60);
    pdf.font('Body').fontSize(9).text(fit.secondary ?? '—', x + 12, top + 72, { width: colW - 24 });
    pdf.font('Bold').fontSize(9).text('Rating', x + 12, top + 94, { continued: true });
    pdf.font('Body').text(`   ${fit.rating ?? '—'}`);

    pdf.x = this.left;
    pdf.y = top + panelH + 16;

    if (fit.justification) {
      this.h3('Vertical fit — justification');
      this.paragraph(fit.justification);
    }

    if (a.qualitativeSummary) {
      this.h3('Qualitative summary');
      this.paragraph(a.qualitativeSummary);
    }

    if (a.requiredFixes?.length) {
      this.h3(`Required fixes (${a.requiredFixes.length})`);
      this.list(a.requiredFixes, true);
    }

    if (a.citationPack?.length) {
      this.h3(`Citation pack (${a.citationPack.length})`);
      this.list(a.citationPack, false);
    }
  }

  private scorecard() {
    const { pdf } = this;
    const sc = (this.e.analysis!.scorecard ?? {}) as unknown as Record<string, number | undefined>;
    const scored = AXES.filter((ax) => sc[ax.key] != null);
    const unscored = AXES.filter((ax) => sc[ax.key] == null);

    this.h2(`Scorecard  ·  ${scored.length} axes scored`);

    for (const ax of scored) {
      const v = sc[ax.key] as number;
      this.ensureSpace(40);
      const y = pdf.y;
      pdf.fillColor(COLOR.text).font('Bold').fontSize(10).text(ax.label, this.left, y, { width: this.width - 60 });
      pdf.fillColor(toneFor(v)).font('Bold').fontSize(10)
        .text(`${v.toFixed(1)} / 10`, this.left + this.width - 60, y, { width: 60, align: 'right' });
      this.bar(this.left, y + 15, this.width, v / 10, toneFor(v), 4);
      pdf.fillColor(COLOR.muted).font('Body').fontSize(8.5)
        .text(ax.description, this.left, y + 22, { width: this.width });
      pdf.y += 8;
    }

    if (unscored.length) {
      pdf.moveDown(0.3);
      pdf.fillColor(COLOR.muted).font('Italic').fontSize(8.5)
        .text(`Not scored (situational): ${unscored.map((u) => u.label).join(', ')}`, this.left, pdf.y, { width: this.width });
    }
  }

  private claims() {
    const { pdf } = this;
    const a = this.e.analysis!;
    pdf.addPage();
    this.h2(`Claims (${a.claims.length})`);

    if (!a.claims.length) {
      this.paragraph('No claims extracted — the transcript had no claimable statements.', COLOR.muted);
      return;
    }

    for (const c of a.claims) {
      this.ensureSpace(90);
      const y = pdf.y;
      const color = verdictColor(c.verdict);

      // Coloured verdict stripe down the left of each claim block.
      const startY = y;
      pdf.x = this.left + 14;

      const flags = [
        c.verdict.toUpperCase(),
        c.loadBearing ? 'LOAD-BEARING' : null,
        c.knownMyth ? 'KNOWN MYTH' : null,
        c.speakerCategory ? c.speakerCategory : null,
      ].filter(Boolean);

      pdf.fillColor(COLOR.muted).font('Body').fontSize(8)
        .text(`#${c.index}   `, this.left + 14, y, { continued: true });
      pdf.fillColor(color).font('Bold').text(flags[0]!, { continued: flags.length > 1 });
      if (flags.length > 1) {
        pdf.fillColor(COLOR.muted).font('Body').text(`   ·   ${flags.slice(1).join('   ·   ')}`);
      }
      pdf.moveDown(0.3);

      pdf.fillColor(COLOR.text).font('Bold').fontSize(10.5)
        .text(c.claim, this.left + 14, pdf.y, { width: this.width - 14 });
      pdf.moveDown(0.4);

      this.labelled('Basis', c.basis || 'No basis provided.');
      if (c.correction) this.labelled('Suggested correction', c.correction, COLOR.amber);

      const endY = pdf.y;
      pdf.save().rect(this.left, startY - 2, 4, endY - startY + 2).fill(color).restore();

      pdf.moveDown(0.4);
      this.rule(0.5);
      pdf.moveDown(0.4);
    }
  }

  private transcript() {
    const { pdf, e } = this;
    if (!e.transcript) return;
    pdf.addPage();
    this.h2('Appendix — Transcript');
    pdf.fillColor(COLOR.muted).font('Body').fontSize(8.5).text(
      `${e.transcript.length.toLocaleString()} chars · ${e.transcriptEngine ?? 'unknown engine'} · ${e.transcriptLanguage ?? '—'}`,
      this.left, pdf.y, { width: this.width },
    );
    pdf.moveDown(0.8);
    pdf.fillColor(COLOR.text).font('Body').fontSize(9.5)
      .text(e.transcript, this.left, pdf.y, { width: this.width, lineGap: 2 });
  }

  /** Page numbers + generation stamp on every page, added after layout. */
  private footer() {
    const { pdf } = this;
    const range = pdf.bufferedPageRange();
    const stamp = `Generated ${fmtDate(new Date())} · GuruSetu QC · ${this.e.evaluationId}`;
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      // The stamp sits inside the bottom margin. pdfkit auto-paginates any
      // text that starts below the margin line, which would append a blank
      // page for every real one, so lift the margin while writing it.
      const savedBottom = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      const y = pdf.page.height - PAGE.margin + 14;
      pdf.fillColor(COLOR.muted).font('Body').fontSize(7.5);
      pdf.text(stamp, this.left, y, { width: this.width - 60, lineBreak: false });
      pdf.text(`${i - range.start + 1} / ${range.count}`, this.left + this.width - 60, y, { width: 60, align: 'right', lineBreak: false });
      pdf.page.margins.bottom = savedBottom;
    }
  }

  /* ----- Primitives ----- */

  private h2(text: string) {
    this.ensureSpace(40);
    this.pdf.fillColor(COLOR.text).font('Bold').fontSize(14).text(text, this.left, this.pdf.y, { width: this.width });
    this.pdf.moveDown(0.6);
  }

  private h3(text: string) {
    this.ensureSpace(30);
    this.pdf.moveDown(0.3);
    this.pdf.fillColor(COLOR.text).font('Bold').fontSize(11).text(text, this.left, this.pdf.y, { width: this.width });
    this.pdf.moveDown(0.3);
  }

  private paragraph(text: string, color = COLOR.text) {
    this.pdf.fillColor(color).font('Body').fontSize(10)
      .text(text, this.left, this.pdf.y, { width: this.width, lineGap: 2 });
    this.pdf.moveDown(0.5);
  }

  private labelled(label: string, text: string, labelColor = COLOR.muted) {
    this.pdf.fillColor(labelColor).font('Bold').fontSize(8.5)
      .text(label.toUpperCase(), this.left + 14, this.pdf.y, { width: this.width - 14, characterSpacing: 0.5 });
    this.pdf.fillColor(COLOR.text).font('Body').fontSize(9.5)
      .text(text, this.left + 14, this.pdf.y, { width: this.width - 14, lineGap: 1.5 });
    this.pdf.moveDown(0.4);
  }

  private list(items: string[], ordered: boolean) {
    const { pdf } = this;
    items.forEach((item, i) => {
      this.ensureSpace(24);
      const marker = ordered ? `${i + 1}.` : '•';
      // The model often numbers its own fixes ("1. Replace…"); don't double it.
      const text = ordered ? item.replace(/^\s*\d+[.)]\s+/, '') : item;
      const y = pdf.y;
      pdf.fillColor(COLOR.muted).font('Body').fontSize(10).text(marker, this.left, y, { width: 18 });
      pdf.fillColor(COLOR.text).text(text, this.left + 18, y, { width: this.width - 18, lineGap: 2 });
      pdf.moveDown(0.3);
    });
    pdf.moveDown(0.3);
  }

  private panel(x: number, y: number, w: number, h: number) {
    this.pdf.save().roundedRect(x, y, w, h, 6).fill(COLOR.panel).restore();
  }

  private bar(x: number, y: number, w: number, frac: number, color: string, h = 5) {
    const f = Math.max(0, Math.min(1, frac));
    this.pdf.save();
    this.pdf.roundedRect(x, y, w, h, h / 2).fill(COLOR.rule);
    if (f > 0) this.pdf.roundedRect(x, y, w * f, h, h / 2).fill(color);
    this.pdf.restore();
  }

  private rule(weight = 1) {
    const { pdf } = this;
    pdf.moveDown(0.5);
    pdf.save().moveTo(this.left, pdf.y).lineTo(this.left + this.width, pdf.y)
      .lineWidth(weight).strokeColor(COLOR.rule).stroke().restore();
    pdf.moveDown(0.6);
  }

  private sectionBreak() {
    this.pdf.moveDown(0.6);
    this.rule();
  }

  /** Start a new page if fewer than `needed` points remain below the cursor. */
  private ensureSpace(needed: number) {
    const bottom = this.pdf.page.height - PAGE.margin;
    if (this.pdf.y + needed > bottom) {
      this.pdf.addPage();
    }
  }
}

function fmtDate(d: Date | string | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}
