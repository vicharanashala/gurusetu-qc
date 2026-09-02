import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  Trash2Icon,
  LoaderIcon,
  AlertCircleIcon,
  SparklesIcon,
  WrenchIcon,
  BookOpenIcon,
  TargetIcon,
  CheckCircle2Icon,
  ShieldAlertIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { StatusBadge, VerdictBadge } from "@/components/badges"
import { ClaimsList } from "@/components/claims-list"
import { ScorecardPanel } from "@/components/scorecard-panel"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item"
import { useEvaluation, useEvaluationList } from "@/lib/use-api"
import { api } from "@/lib/api"
import { formatRelative, formatShortDate } from "@/lib/format"
import {
  SOURCE_LABELS,

  type OverallVerdict,
  type Tally,
  type VerticalFit,
} from "@/lib/types"

export const Route = createFileRoute("/evaluations/$evaluationId")({
  component: EvaluationDetail,
})

function EvaluationDetail() {
  const { evaluationId } = Route.useParams()
  const navigate = useNavigate()
  const list = useEvaluationList({ limit: 100 })
  const evalState = useEvaluation(evaluationId, true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rerunning, setRerunning] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const e = evalState.data

  // Mark list as seen (so the dashboard reflects the rerun)
  void list.reload

  const onRerun = async () => {
    if (!e) return
    setActionError(null)
    setRerunning(true)
    try {
      const fresh = await api.rerun(e.evaluationId)
      // Trigger list refresh so dashboard reflects new state
      list.reload()
      navigate({
        to: "/evaluations/$evaluationId",
        params: { evaluationId: fresh.evaluationId },
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Re-run failed")
    } finally {
      setRerunning(false)
    }
  }

  const onDelete = async () => {
    if (!e) return
    setActionError(null)
    setDeleting(true)
    try {
      await api.remove(e.evaluationId)
      list.reload()
      navigate({ to: "/" })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed")
      setDeleting(false)
    }
  }

  if (evalState.loading && !e) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        Loading evaluation…
      </div>
    )
  }

  if (evalState.error || !e) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" render={<Link to="/"><ArrowLeftIcon className="size-4" />Back</Link>} />
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          {evalState.error ?? "Evaluation not found"}
        </div>
      </div>
    )
  }

  const inProgress = ["pending", "transcribing", "analyzing"].includes(e.status)
  const analysis = e.analysis

  return (
    <div className="space-y-6">
      {/* ===== Top action bar ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link to="/">
              <ArrowLeftIcon className="size-4" />
              Back to dashboard
            </Link>
          }
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rerunning || deleting || inProgress}
            onClick={onRerun}
          >
            {rerunning ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-4" />
            )}
            Re-run
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={deleting || rerunning}>
                  {deleting ? (
                    <LoaderIcon className="size-4 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                  Delete
                </Button>
              }
            />
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete evaluation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes &ldquo;{e.title}&rdquo; and its transcript,
                  claims, and rubric. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircleIcon className="size-4" />
          {actionError}
        </div>
      )}

      {/* ===== Header ===== */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{e.title}</h1>
          <StatusBadge status={e.status} />
          {analysis?.verdict && <VerdictBadge verdict={analysis.verdict} />}
          {e.runNumber > 1 && (
            <Badge variant="secondary">run #{e.runNumber}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {SOURCE_LABELS[e.sourceType]} · created{" "}
          {formatRelative(e.createdAt)} ({formatShortDate(e.createdAt)}) ·
          id <code className="rounded bg-muted px-1 py-0.5 text-xs text-secondary-foreground">{e.evaluationId}</code>
        </p>
        {e.parentEvaluationId && (
          <p className="text-xs text-muted-foreground">
            Re-run of{" "}
            <Link
              to="/evaluations/$evaluationId"
              params={{ evaluationId: e.parentEvaluationId }}
              className="text-primary hover:underline"
            >
              {e.parentEvaluationId}
            </Link>
          </p>
        )}
      </header>

      {/* ===== In-progress bar ===== */}
      {inProgress && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{e.statusMessage ?? "Working…"}</span>
              <span className="font-mono">{e.progress}%</span>
            </div>
            <Progress value={e.progress} className="mt-2" />
          </CardContent>
        </Card>
      )}

      {/* ===== Failed ===== */}
      {e.status === "failed" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Evaluation failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{e.failureReason ?? "Unknown failure reason"}</p>
          </CardContent>
        </Card>
      )}

      {/* ===== Tabs ===== */}
      {analysis && (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="overview">
              <SparklesIcon className="mr-1.5 size-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="claims">
              <TargetIcon className="mr-1.5 size-4" /> Claims ({analysis.claims.length})
            </TabsTrigger>
            <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
          </TabsList>

          {/* ----- Overview ----- */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <OverallScoreCard
                score={analysis.overallScore}
                verdict={analysis.verdict}
                claimCount={analysis.tally.total}
                model={e.analysisModel}
              />
              <TallyCard tally={analysis.tally} />
              <VerticalFitCard fit={analysis.verticalFit} />
            </div>

            {analysis.qualitativeSummary && (
              <Card>
                <CardHeader>
                  <CardTitle>Qualitative summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="leading-relaxed">{analysis.qualitativeSummary}</p>
                </CardContent>
              </Card>
            )}

            {analysis.requiredFixes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <WrenchIcon className="size-4 text-highlight" />
                    Required fixes ({analysis.requiredFixes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal space-y-2 pl-5">
                    {analysis.requiredFixes.map((fix, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        {fix}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            )}

            {analysis.citationPack.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenIcon className="size-4 text-secondary" />
                    Citation pack ({analysis.citationPack.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {analysis.citationPack.map((ref, i) => (
                      <li key={i} className="text-sm leading-relaxed">
                        {ref}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ----- Claims ----- */}
          <TabsContent value="claims">
            <ClaimsList claims={analysis.claims} tally={analysis.tally} />
          </TabsContent>

          {/* ----- Scorecard ----- */}
          <TabsContent value="scorecard">
            <ScorecardPanel scorecard={analysis.scorecard} />
          </TabsContent>

          {/* ----- Transcript ----- */}
          <TabsContent value="transcript">
            <Card>
              <CardHeader>
                <CardTitle>Transcript</CardTitle>
                <CardDescription>
                  {(e.transcript ?? "").length.toLocaleString()} chars ·{" "}
                  {e.transcriptEngine ?? "unknown"} ·{" "}
                  {e.transcriptLanguage ?? "—"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {e.transcript ? (
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 font-mono text-sm leading-relaxed">
                    {e.transcript}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No transcript available.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!analysis && !inProgress && e.status !== "failed" && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No analysis available.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ============================== Sub-components ============================== */

function OverallScoreCard({
  score,
  verdict,
  claimCount,
  model,
}: {
  score: number
  verdict: OverallVerdict
  claimCount: number
  model?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overall score</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums">
            {score.toFixed(1)}
          </span>
          <span className="text-muted-foreground">/ 10</span>
        </div>
        <Progress
          value={score * 10}
          className={`[&_[data-slot=progress-track]]:h-2 ${
            score >= 7.5
              ? "[&_[data-slot=progress-indicator]]:bg-verdict-green"
              : score >= 5
                ? "[&_[data-slot=progress-indicator]]:bg-verdict-amber"
                : "[&_[data-slot=progress-indicator]]:bg-verdict-red"
          }`}
        />
        <VerdictBadge verdict={verdict} />
        <ItemGroup className="pt-1">
          <ItemSeparator />
          <Item size="xs">
            <ItemContent>
              <ItemDescription>Claims audited</ItemDescription>
              <ItemTitle className="tabular-nums">{claimCount}</ItemTitle>
            </ItemContent>
          </Item>
          {model && (
            <>
              <ItemSeparator />
              <Item size="xs">
                <ItemContent>
                  <ItemDescription>Analysed by</ItemDescription>
                  <ItemTitle className="font-mono text-xs">{model}</ItemTitle>
                </ItemContent>
              </Item>
            </>
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function TallyCard({ tally }: { tally: Tally }) {
  const total = Math.max(tally.total, 1)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim tally</CardTitle>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {/* Every Tailwind class here is a complete literal. Building them by
              interpolating a variable (`...:${dot}`) does not work: the JIT
              scanner only ever sees source text, so the class would silently
              not exist in the stylesheet. */}
          {([
            {
              label: "Green",
              n: tally.green,
              dot: "bg-verdict-green",
              text: "text-verdict-green",
              bar: "[&_[data-slot=progress-indicator]]:bg-verdict-green",
              desc: "Verified and honestly framed",
            },
            {
              label: "Amber",
              n: tally.amber,
              dot: "bg-verdict-amber",
              text: "text-verdict-amber",
              bar: "[&_[data-slot=progress-indicator]]:bg-verdict-amber",
              desc: "Directionally right, imprecisely stated",
            },
            {
              label: "Red",
              n: tally.red,
              dot: "bg-verdict-red",
              text: "text-verdict-red",
              bar: "[&_[data-slot=progress-indicator]]:bg-verdict-red",
              desc: "Fails outright, stated as fact",
            },
          ] as const).map(({ label, n, dot, text, bar, desc }, i) => (
            <div key={label}>
              {i > 0 && <ItemSeparator />}
              <Item size="xs">
                <ItemMedia>
                  <span aria-hidden className={`size-2 rounded-full ${dot}`} />
                </ItemMedia>
                <ItemContent className="gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <ItemTitle>{label}</ItemTitle>
                    <span className={`text-sm font-semibold tabular-nums ${text}`}>
                      {n}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {Math.round((n / total) * 100)}%
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={(n / total) * 100}
                    className={`[&_[data-slot=progress-track]]:h-1.5 ${bar}`}
                  />
                  <ItemDescription>{desc}</ItemDescription>
                </ItemContent>
              </Item>
            </div>
          ))}
        </ItemGroup>

        {tally.loadBearingReds > 0 && (
          <Alert variant="destructive" className="mt-4">
            <ShieldAlertIcon />
            <AlertTitle>
              {tally.loadBearingReds} load-bearing red claim
              {tally.loadBearingReds > 1 ? "s" : ""}
            </AlertTitle>
            <AlertDescription>
              A red claim the lesson depends on. This forces a
              revise-before-release verdict — the segment needs re-recording.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function VerticalFitCard({ fit }: { fit: VerticalFit }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Vertical fit
          <span className="text-highlight">{fit.rating}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ItemGroup>
          <Item size="xs">
            <ItemContent>
              <ItemDescription>Best fit</ItemDescription>
              <ItemTitle>{fit.bestFit}</ItemTitle>
            </ItemContent>
          </Item>
          <ItemSeparator />
          <Item size="xs">
            <ItemContent>
              <ItemDescription>Secondary</ItemDescription>
              <ItemTitle>{fit.secondary}</ItemTitle>
            </ItemContent>
          </Item>
        </ItemGroup>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {fit.justification}
        </p>
      </CardContent>
    </Card>
  )
}

// Mark used for lint
void Separator
void CheckCircle2Icon
