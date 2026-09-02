import { Link } from "@tanstack/react-router"
import { StatusBadge, VerdictBadge } from "@/components/badges"
import { SourceBadge } from "@/components/source-badge"
import { Progress } from "@/components/ui/progress"
import { Sparkline } from "@/components/sparkline"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Empty } from "@/components/ui/empty"
import {
  type Evaluation,
  STATUS_LABELS,
} from "@/lib/types"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  ExternalLinkIcon,
} from "lucide-react"
import { formatShortDate, formatRelative } from "@/lib/format"
import type { SortDir, SortKey } from "@/components/filter-bar"
import { cn } from "@/lib/utils"

export function EvaluationTable({
  evaluations,
  sortKey,
  sortDir,
  onSort,
}: {
  evaluations: Evaluation[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}) {
  if (!evaluations.length) {
    return (
      <Empty>
        <EmptyHeader />
      </Empty>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <Th
            className="w-[36%] pl-6"
            onClick={() => onSort("title")}
            active={sortKey === "title"}
            dir={sortDir}
          >
            Evaluation
          </Th>
          <Th onClick={() => onSort("sourceType")} active={sortKey === "sourceType"} dir={sortDir}>
            Source
          </Th>
          <Th onClick={() => onSort("status")} active={sortKey === "status"} dir={sortDir}>
            Status
          </Th>
          <Th
            className="text-right"
            onClick={() => onSort("overallScore")}
            active={sortKey === "overallScore"}
            dir={sortDir}
          >
            Score
          </Th>
          <Th>Tally</Th>
          <Th>Verdict</Th>
          <Th>Trend</Th>
          <Th
            className="text-right pr-6"
            onClick={() => onSort("createdAt")}
            active={sortKey === "createdAt"}
            dir={sortDir}
          >
            Created
          </Th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {evaluations.map((e) => (
          <EvaluationRow key={e.evaluationId} e={e} />
        ))}
      </TableBody>
    </Table>
  )
}

function Th({
  children,
  className,
  onClick,
  active,
  dir,
}: {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  active?: boolean
  dir?: SortDir
}) {
  const Icon = !onClick
    ? null
    : !active
      ? ArrowUpDownIcon
      : dir === "asc"
        ? ArrowUpIcon
        : ArrowDownIcon
  return (
    <TableHead className={cn("px-3 py-2.5", className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider hover:text-foreground transition-colors",
            active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {children}
          {Icon && <Icon className="size-3" />}
        </button>
      ) : (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {children}
        </span>
      )}
    </TableHead>
  )
}

function EmptyHeader() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <p className="text-sm font-medium text-foreground">No evaluations match</p>
      <p className="text-xs text-muted-foreground mt-1">
        Try clearing filters or submit a new audit.
      </p>
    </div>
  )
}

function EvaluationRow({ e }: { e: Evaluation }) {
  const inProgress = ["pending", "transcribing", "analyzing"].includes(
    e.status,
  )
  const score = e.analysis?.overallScore
  const tally = e.analysis?.tally
  const trend = e.analysis?.claims?.map((c) =>
    c.verdict === "green" ? 9 : c.verdict === "amber" ? 5 : 2,
  )

  return (
    <TableRow className="group">
      <TableCell className="pl-6 pr-3 py-3 align-top">
        <Link
          to="/evaluations/$evaluationId"
          params={{ evaluationId: e.evaluationId }}
          className="block max-w-[420px]"
        >
          <div className="flex items-start gap-2">
            <span className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {e.title}
            </span>
            {e.runNumber > 1 && (
              <Badge variant="outline" className="shrink-0 font-mono">
                #{e.runNumber}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/80">
            <code className="font-mono">{e.evaluationId.slice(0, 8)}</code>
            {e.analysisPromptVersion &&
              e.analysisPromptVersion !== "bundled-default" && (
                <span>· prompt: {e.analysisPromptVersion}</span>
              )}
            <ExternalLinkIcon className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
        </Link>
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        <SourceBadge sourceType={e.sourceType} />
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        <div className="space-y-1.5">
          <StatusBadge status={e.status} />
          {inProgress && (
            <div className="w-32 space-y-1">
              <Progress
                value={e.progress}
                className="h-1.5"
              />
              <p className="text-[10px] text-muted-foreground truncate">
                {e.statusMessage ?? STATUS_LABELS[e.status]}
              </p>
            </div>
          )}
        </div>
      </TableCell>

      <TableCell className="px-3 py-3 align-top text-right">
        {score != null ? (
          <ScorePill score={score} />
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        {tally ? (
          <div className="flex items-center gap-1.5 text-xs">
            <TallyChip tone="green" count={tally.green} />
            <TallyChip tone="amber" count={tally.amber} />
            <TallyChip tone="red" count={tally.red} />
            {tally.loadBearingReds > 0 && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {tally.loadBearingReds} LB
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        {e.analysis?.verdict ? (
          <VerdictBadge verdict={e.analysis.verdict} />
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      <TableCell className="px-3 py-3 align-top">
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} tone="primary" width={80} height={22} />
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      <TableCell className="px-3 py-3 pr-6 align-top text-right">
        <div className="text-xs text-foreground" title={formatShortDate(e.createdAt)}>
          {formatRelative(e.createdAt)}
        </div>
        <div className="text-[10px] text-muted-foreground/70 font-mono">
          {formatShortDate(e.createdAt).split(",")[0]}
        </div>
      </TableCell>
    </TableRow>
  )
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 7.5
      ? "text-chart-1"
      : score >= 5
        ? "text-chart-3"
        : "text-destructive"
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-md border px-2 py-1 font-mono tabular-nums",
        tone,
      )}
      style={{
        borderColor: `color-mix(in oklch, currentColor 30%, transparent)`,
        backgroundColor: `color-mix(in oklch, currentColor 12%, transparent)`,
      }}
    >
      <span className="text-lg font-bold leading-none">
        {score.toFixed(1)}
      </span>
      <span className="text-[10px] text-muted-foreground leading-none">/10</span>
    </span>
  )
}

function TallyChip({
  tone,
  count,
}: {
  tone: "green" | "amber" | "red"
  count: number
}) {
  const tones = {
    green: "text-chart-1",
    amber: "text-chart-3",
    red: "text-destructive",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums",
        tones[tone],
      )}
      style={{
        backgroundColor: `color-mix(in oklch, currentColor 12%, transparent)`,
      }}
    >
      <span className="text-base leading-none">{count}</span>
    </span>
  )
}
