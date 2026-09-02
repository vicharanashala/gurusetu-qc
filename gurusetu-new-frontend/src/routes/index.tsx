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

  const sourceSlices: DonutDatum[] = (Object.entries(sourceBreakdown) as Array<[
    EvaluationSourceType,
    number,
  ]>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({
      label: SOURCE_LABELS[k],
      value: n,
      colorVar: SOURCE_COLORS[k],
    }))

  const verdictSlices: DonutDatum[] = (Object.entries(verdictBreakdown) as Array<[
    OverallVerdict,
    number,
  ]>)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({
      label: VERDICT_LABEL[k],
      value: n,
      colorVar: VERDICT_COLORS[k],
    }))

  const sourceChartConfig = Object.fromEntries(
    Object.entries(SOURCE_COLORS).map(([k, v]) => [
      k,
      { label: SOURCE_LABELS[k as EvaluationSourceType], color: `var(${v})` },
    ]),
  )
  const verdictChartConfig = Object.fromEntries(
    Object.entries(VERDICT_COLORS).map(([k, v]) => [
      k,
      { label: VERDICT_LABEL[k as OverallVerdict], color: `var(${v})` },
    ]),
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
            <RefreshCwIcon className="size-4" />
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
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          label="Total evaluations"
          value={stats.data?.total ?? evaluations.length}
          hint={`${completedCount} completed · ${inProgressCount} in flight`}
          icon={<DatabaseIcon className="size-4" />}
          trend={scoreHistory.length ? scoreHistory : undefined}
        />
        <KpiCard
          label="Average score"
          value={
            stats.data?.averageScore != null
              ? stats.data.averageScore.toFixed(1)
              : avgScore.toFixed(1)
          }
          hint="across completed evaluations"
          icon={<SparklesIcon className="size-4" />}
          trend={scoreHistory}
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
              <div className="relative h-40">
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
              <div className="relative h-40">
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

        {list.loading ? (
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
