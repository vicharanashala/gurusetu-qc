import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi-card"
import {
  Donut,
  ScoreHistogram,
  type DonutDatum,
} from "@/components/charts"
import { EvaluationTable } from "@/components/evaluation-table"
import { FilterBar, type SortDir, type SortKey } from "@/components/filter-bar"
import {
  SparklesIcon,
  DatabaseIcon,
  LoaderIcon,
  RefreshCwIcon,
  PlusIcon,
  AlertCircleIcon,
  Video,
  XIcon,
  CheckCircle2Icon,
  ShieldAlertIcon,
} from "lucide-react"
import {
  type Evaluation,
  type EvaluationSourceType,
  type EvaluationStatus,
  type OverallVerdict,
  SOURCE_LABELS,
} from "@/lib/types"
import { useEvaluationList, useEvaluationStats } from "@/lib/use-api"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  component: Dashboard,
})

const SOURCE_COLORS: Record<EvaluationSourceType, string> = {
  text: "--chart-2",
  file_audio: "--chart-1",
  file_video: "--chart-3",
  file_text: "--chart-5",
  youtube: "--destructive",
}

const VERDICT_COLORS: Record<OverallVerdict, string> = {
  "accept-as-is": "--chart-1",
  "accept-with-minor-revisions": "--chart-3",
  "revise-before-release": "--destructive",
  "blocked-on-media": "--muted-foreground",
}

const VERDICT_LABEL: Record<OverallVerdict, string> = {
  "accept-as-is": "Accept",
  "accept-with-minor-revisions": "Minor revisions",
  "revise-before-release": "Revise",
  "blocked-on-media": "Blocked",
}

function Dashboard() {
  const list = useEvaluationList({ limit: 100 })
  const stats = useEvaluationStats()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<EvaluationStatus | null>(null)
  const [sourceFilter, setSourceFilter] = useState<EvaluationSourceType | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const evaluations: Evaluation[] = list.data?.items ?? []

  const scored = evaluations.filter((e) => e.analysis?.overallScore != null)
  const completedCount = evaluations.filter((e) => e.status === "completed").length
  const inProgressCount = evaluations.filter((e) =>
    ["pending", "transcribing", "analyzing"].includes(e.status),
  ).length
  const failedCount = evaluations.filter((e) => e.status === "failed").length
  const avgScore =
    scored.length > 0
      ? scored.reduce((a, b) => a + (b.analysis?.overallScore ?? 0), 0) / scored.length
      : 0

  // "Release-ready" mirrors the rubric's own thresholds: only accept-as-is and
  // accept-with-minor-revisions can ship. revise-before-release and
  // blocked-on-media cannot.
  const releaseReady = evaluations.filter((e) =>
    e.analysis?.verdict === "accept-as-is" ||
    e.analysis?.verdict === "accept-with-minor-revisions",
  ).length
  const needsRevision = evaluations.filter(
    (e) => e.analysis?.verdict === "revise-before-release",
  ).length
  const blockedOnMedia = evaluations.filter(
    (e) => e.analysis?.verdict === "blocked-on-media",
  ).length
  const verdictTotal = releaseReady + needsRevision + blockedOnMedia
  const readyPct = verdictTotal > 0 ? (releaseReady / verdictTotal) * 100 : 0

  // Load-bearing reds are the rubric's most serious finding: a false claim the
  // lesson actually depends on. Worth its own tile.
  const loadBearingReds = evaluations.reduce(
    (n, e) => n + (e.analysis?.tally?.loadBearingReds ?? 0),
    0,
  )
  const totalReds = evaluations.reduce(
    (n, e) => n + (e.analysis?.tally?.red ?? 0),
    0,
  )
  const totalClaims = evaluations.reduce(
    (n, e) => n + (e.analysis?.tally?.total ?? 0),
    0,
  )
  const affectedAudits = evaluations.filter(
    (e) => (e.analysis?.tally?.loadBearingReds ?? 0) > 0,
  ).length

  const scoreHistory = useMemo(
    () =>
      scored
        .filter((e) => e.createdAt)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        .map((e) => e.analysis?.overallScore ?? 0),
    [scored],
  )

  const sourceBreakdown = useMemo(() => {
    const counts: Record<EvaluationSourceType, number> = {
      text: 0,
      file_audio: 0,
      file_video: 0,
      file_text: 0,
      youtube: 0,
    }
    for (const e of evaluations) counts[e.sourceType]++
    return counts
  }, [evaluations])

  const verdictBreakdown = useMemo(() => {
    const counts: Record<OverallVerdict, number> = {
      "accept-as-is": 0,
      "accept-with-minor-revisions": 0,
      "revise-before-release": 0,
      "blocked-on-media": 0,
    }
    for (const e of evaluations) {
      const v = e.analysis?.verdict
      if (v) counts[v]++
    }
    return counts
  }, [evaluations])

  const scoreBuckets = useMemo(
    () => scored.map((e) => e.analysis?.overallScore ?? 0),
    [scored],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return evaluations.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false
      if (sourceFilter && e.sourceType !== sourceFilter) return false
      if (q) {
        const hay = (e.title + " " + (e.transcript ?? "")).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [evaluations, search, statusFilter, sourceFilter])

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir
        case "sourceType":
          return a.sourceType.localeCompare(b.sourceType) * dir
        case "status":
          return a.status.localeCompare(b.status) * dir
        case "overallScore": {
          const av = a.analysis?.overallScore ?? -1
          const bv = b.analysis?.overallScore ?? -1
          return (av - bv) * dir
        }
        case "progress":
          return a.progress - b.progress
        case "createdAt":
        default:
          return (+new Date(a.createdAt) - +new Date(b.createdAt)) * dir
      }
    })
  }, [filtered, sortKey, sortDir])

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "createdAt" || key === "overallScore" ? "desc" : "asc")
    }
  }

  // These feed recharts' `data` prop. Rebuilding them on every render gives the
  // array a new identity each poll, which recharts reads as new data and
  // replays the donut's grow-in animation every 5 seconds.
  const sourceSlices: DonutDatum[] = useMemo(
    () =>
      (Object.entries(sourceBreakdown) as Array<[EvaluationSourceType, number]>)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => ({
          label: SOURCE_LABELS[k],
          value: n,
          colorVar: SOURCE_COLORS[k],
        })),
    [sourceBreakdown],
  )

  const verdictSlices: DonutDatum[] = useMemo(
    () =>
      (Object.entries(verdictBreakdown) as Array<[OverallVerdict, number]>)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => ({
          label: VERDICT_LABEL[k],
          value: n,
          colorVar: VERDICT_COLORS[k],
        })),
    [verdictBreakdown],
  )

  // Static: derived only from module-level constants.
  const sourceChartConfig = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(SOURCE_COLORS).map(([k, v]) => [
          k,
          { label: SOURCE_LABELS[k as EvaluationSourceType], color: `var(${v})` },
        ]),
      ),
    [],
  )
  const verdictChartConfig = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(VERDICT_COLORS).map(([k, v]) => [
          k,
          { label: VERDICT_LABEL[k as OverallVerdict], color: `var(${v})` },
        ]),
      ),
    [],
  )

  return (
    <div className="space-y-6">
      {/* ===== Page header ===== */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Quality audits</h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              v1.0
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every claim audited, every rubric versioned, every transcript revisitable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              list.reload()
              stats.reload()
            }}
          >
            {/* Background polls spin this icon instead of blanking the table. */}
            <RefreshCwIcon
              className={cn("size-4", list.refreshing && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            render={
              <Link to="/new">
                <PlusIcon className="size-4" />
                New audit
              </Link>
            }
          />
        </div>
      </section>

      {/* ===== KPI row ===== */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total evaluations"
          value={stats.data?.total ?? evaluations.length}
          hint={
            inProgressCount > 0
              ? `${inProgressCount} still running`
              : "all runs settled"
          }
          icon={<DatabaseIcon className="size-4" />}
          explain={
            <>
              Every audit ever submitted, in any state. The badges split it by
              status: <strong>completed</strong> finished analysis,{" "}
              <strong>in flight</strong> is still downloading, transcribing or
              analysing, and <strong>failed</strong> hit an error before
              producing a verdict.
            </>
          }
          breakdown={[
            { label: "Completed", value: completedCount, colorVar: "--chart-1" },
            { label: "In flight", value: inProgressCount, colorVar: "--chart-3" },
            { label: "Failed", value: failedCount, colorVar: "--destructive" },
          ]}
        />

        <KpiCard
          label="Average score"
          value={
            scored.length > 0
              ? (stats.data?.averageScore ?? avgScore).toFixed(1)
              : "—"
          }
          suffix={scored.length > 0 ? "/ 10" : undefined}
          hint={
            scored.length > 0
              ? `mean of ${scored.length} scored audit${scored.length === 1 ? "" : "s"}`
              : "nothing scored yet"
          }
          icon={<SparklesIcon className="size-4" />}
          tone="chart-2"
          explain={
            <>
              The mean <strong>overall score</strong> (0–10) across audits that
              produced one. Failed and in-flight runs are excluded, so this is
              not an average over all evaluations. The score is the model&apos;s
              own composite of the rubric axes — factual accuracy, evidence
              grounding, citation hygiene, and the rest.
            </>
          }
          trend={scoreHistory.length > 1 ? scoreHistory : undefined}
        />

        <KpiCard
          label="Release-ready"
          value={verdictTotal > 0 ? Math.round(readyPct) : "—"}
          suffix={verdictTotal > 0 ? "%" : undefined}
          hint={
            verdictTotal > 0
              ? `${releaseReady} of ${verdictTotal} audited`
              : "no verdicts yet"
          }
          icon={<CheckCircle2Icon className="size-4" />}
          tone="chart-1"
          meter={
            verdictTotal > 0
              ? {
                  value: readyPct,
                  caption: `${needsRevision} need revision${blockedOnMedia ? ` · ${blockedOnMedia} blocked on media` : ""}`,
                }
              : undefined
          }
          explain={
            <>
              Share of audited content that can ship as-is or with only minor
              edits — verdicts <strong>accept-as-is</strong> and{" "}
              <strong>accept-with-minor-revisions</strong>. The remainder is{" "}
              <strong>revise-before-release</strong> or{" "}
              <strong>blocked-on-media</strong>. Only audits with a verdict count
              toward the denominator.
            </>
          }
        />

        <KpiCard
          label="Load-bearing reds"
          value={loadBearingReds}
          hint={
            loadBearingReds > 0
              ? `across ${affectedAudits} audit${affectedAudits === 1 ? "" : "s"}`
              : "none found"
          }
          icon={<ShieldAlertIcon className="size-4" />}
          tone="chart-3"
          explain={
            <>
              The rubric&apos;s most serious finding: a claim that fails outright{" "}
              <em>and</em> carries the lesson — a central thesis or explicit
              instruction, not an aside. Any single one forces a{" "}
              <strong>revise-before-release</strong> verdict, so this is the
              number to drive to zero.
            </>
          }
          breakdown={[
            { label: "All reds", value: totalReds, colorVar: "--destructive" },
            { label: "Claims checked", value: totalClaims },
          ]}
        />
      </section>

      {/* ===== Charts row ===== */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <p className="text-xs text-muted-foreground">
              {scored.length === 0
                ? "No scored evaluations yet"
                : `${scored.length} scored · mean ${avgScore.toFixed(1)}`}
            </p>
          </CardHeader>
          <CardContent>
            <ScoreHistogram scores={scoreBuckets} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Source mix</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceSlices.length ? (
              <div className="relative flex h-40 justify-center">
                <Donut
                  data={sourceSlices}
                  centerLabel="inputs"
                  centerValue={String(evaluations.length)}
                  config={sourceChartConfig}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground h-40 grid place-items-center">
                No data yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Verdict mix</CardTitle>
          </CardHeader>
          <CardContent>
            {verdictSlices.length ? (
              <div className="relative flex h-40 justify-center">
                <Donut
                  data={verdictSlices}
                  centerLabel="audits"
                  centerValue={String(
                    Object.values(verdictBreakdown).reduce((a, b) => a + b, 0),
                  )}
                  config={verdictChartConfig}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground h-40 grid place-items-center">
                No data yet.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== Table ===== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Audits{" "}
            <span className="text-muted-foreground font-normal">
              ({sorted.length} of {evaluations.length})
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Quick filters:</span>
            <FilterChip
              active={statusFilter === "completed"}
              onClick={() =>
                setStatusFilter((s) => (s === "completed" ? null : "completed"))
              }
              tone="chart-1"
              count={completedCount}
            >
              Completed
            </FilterChip>
            <FilterChip
              active={
                statusFilter === "transcribing" ||
                statusFilter === "analyzing" ||
                statusFilter === "pending"
              }
              onClick={() =>
                setStatusFilter((s) =>
                  ["transcribing", "analyzing", "pending"].includes(
                    s as string,
                  )
                    ? null
                    : "transcribing",
                )
              }
              tone="chart-3"
              count={inProgressCount}
            >
              In flight
            </FilterChip>
            <FilterChip
              active={statusFilter === "failed"}
              onClick={() =>
                setStatusFilter((s) => (s === "failed" ? null : "failed"))
              }
              tone="destructive"
              count={failedCount}
            >
              Failed
            </FilterChip>
            <span className="mx-1 text-border">·</span>
            <FilterChip
              active={sourceFilter === "youtube"}
              onClick={() =>
                setSourceFilter((s) => (s === "youtube" ? null : "youtube"))
              }
              icon={<Video className="size-3" />}
              count={sourceBreakdown.youtube}
            >
              YouTube
            </FilterChip>
            <FilterChip
              active={sourceFilter === "text"}
              onClick={() =>
                setSourceFilter((s) => (s === "text" ? null : "text"))
              }
              count={sourceBreakdown.text}
            >
              Text
            </FilterChip>
            <FilterChip
              active={sourceFilter === "file_text"}
              onClick={() =>
                setSourceFilter((s) => (s === "file_text" ? null : "file_text"))
              }
              count={sourceBreakdown.file_text}
            >
              Text file
            </FilterChip>
          </div>
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          hasActiveFilter={Boolean(search || statusFilter || sourceFilter)}
          onClearAll={() => {
            setSearch("")
            setStatusFilter(null)
            setSourceFilter(null)
          }}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={(k, d) => {
            setSortKey(k)
            setSortDir(d)
          }}
        />

        {list.loading && !list.data ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-10 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" /> Loading audits…
          </div>
        ) : list.error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-destructive">
            <AlertCircleIcon className="size-4" />
            {list.error}
          </div>
        ) : (
          <EvaluationTable
            evaluations={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
          />
        )}
      </section>
    </div>
  )
}

function FilterChip({
  children,
  active,
  onClick,
  tone,
  count,
  icon,
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  tone?: "chart-1" | "chart-3" | "destructive"
  count?: number
  icon?: React.ReactNode
}) {
  const variant: React.ComponentProps<typeof Badge>["variant"] = active
    ? tone === "destructive"
      ? "destructive"
      : tone === "chart-3"
        ? "secondary"
        : "default"
    : "outline"
  return (
    <Badge
      variant={variant}
      className={cn(
        "cursor-pointer select-none transition-opacity hover:opacity-80",
        !active && "text-muted-foreground",
      )}
      onClick={onClick}
    >
      {icon}
      {children}
      {count != null && (
        <span className="font-mono text-[10px] opacity-80">{count}</span>
      )}
      {active && <XIcon className="size-2.5" />}
    </Badge>
  )
}
