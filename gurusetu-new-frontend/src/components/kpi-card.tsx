import { Card, CardContent } from "@/components/ui/card"
import { Sparkline } from "@/components/sparkline"
import { cn } from "@/lib/utils"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

export function KpiCard({
  label,
  value,
  hint,
  trend,
  tone = "primary",
  icon,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  trend?: number[]
  tone?: "primary" | "chart-1" | "chart-2" | "chart-3" | "chart-5"
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("@container", className)}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-3xl font-bold tabular-nums leading-none text-card-foreground">
              {value}
            </p>
            {hint && (
              <p className="text-xs text-muted-foreground/80 mt-1">{hint}</p>
            )}
          </div>
          {icon && (
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              {icon}
            </div>
          )}
        </div>
        <div className="flex items-end justify-between">
          {trend && trend.length > 1 ? (
            <Sparkline values={trend} tone={tone} width={120} height={32} />
          ) : (
            <div className="h-8" />
          )}
        </div>
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
