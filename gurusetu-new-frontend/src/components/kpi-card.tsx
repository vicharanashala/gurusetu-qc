import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Sparkline } from "@/components/sparkline"
import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowUpRight, InfoIcon, Minus } from "lucide-react"

export interface KpiBreakdownItem {
  label: string
  value: number | string
  /** CSS custom property name, e.g. "--chart-1". Renders a colour dot. */
  colorVar?: string
}

/**
 * A dashboard tile. `explain` is required: every number on the dashboard should
 * be able to say what it counts, because "Average score 6.0" is meaningless
 * without knowing which evaluations it averages over.
 */
export function KpiCard({
  label,
  value,
  suffix,
  hint,
  explain,
  breakdown,
  meter,
  trend,
  tone = "primary",
  icon,
  className,
}: {
  label: string
  value: string | number
  suffix?: string
  hint?: string
  /** Shown in the tooltip behind the (i). Say exactly what the number means. */
  explain: React.ReactNode
  breakdown?: KpiBreakdownItem[]
  /** 0-100. Renders a progress bar under the value. */
  meter?: { value: number; caption?: string }
  trend?: number[]
  tone?: "primary" | "chart-1" | "chart-2" | "chart-3" | "chart-5"
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("@container", className)}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`What does "${label}" mean?`}
                      className="text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    >
                      <InfoIcon className="size-3.5" />
                    </button>
                  }
                />
                {/* TooltipContent is `inline-flex ... gap-1.5`, built for short
                    one-line labels. A multi-node body would become one flex
                    column per node, so wrap it in a single block child to get
                    normal text flow back. */}
                <TooltipContent className="max-w-[280px]">
                  <span className="block text-xs font-normal leading-relaxed">
                    {explain}
                  </span>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="flex items-baseline gap-1 text-3xl font-bold tabular-nums leading-none text-card-foreground">
              {value}
              {suffix && (
                <span className="text-base font-medium text-muted-foreground">
                  {suffix}
                </span>
              )}
            </p>
            {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
          </div>
          {icon && (
            <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
              {icon}
            </div>
          )}
        </div>

        {meter && (
          <div className="space-y-1">
            {/* The track is h-3 by default and the root is a flex wrapper, so
                the height has to be set on the track itself. */}
            <Progress
              value={meter.value}
              className="[&_[data-slot=progress-track]]:h-1.5"
            />
            {meter.caption && (
              <p className="text-[11px] text-muted-foreground">{meter.caption}</p>
            )}
          </div>
        )}

        {breakdown && breakdown.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {breakdown.map((b) => (
              <Badge
                key={b.label}
                variant="outline"
                className="gap-1.5 font-normal text-muted-foreground"
              >
                {b.colorVar && (
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: `var(${b.colorVar})` }}
                  />
                )}
                {b.label}
                <span className="font-mono tabular-nums text-foreground">
                  {b.value}
                </span>
              </Badge>
            ))}
          </div>
        )}

        {trend && trend.length > 1 && (
          <div className="mt-auto pt-1">
            <Sparkline values={trend} tone={tone} width={120} height={32} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function DeltaPill({
  value,
  suffix = "%",
  className,
}: {
  value: number
  suffix?: string
  className?: string
}) {
  const isUp = value > 0
  const isFlat = value === 0
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight
  const tone = isFlat
    ? "text-muted-foreground"
    : isUp
      ? "text-chart-1"
      : "text-destructive"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        tone,
        className,
      )}
      style={{
        borderColor: `color-mix(in oklch, currentColor 30%, transparent)`,
        backgroundColor: `color-mix(in oklch, currentColor 10%, transparent)`,
      }}
    >
      <Icon className="size-3" />
      {isUp ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}
