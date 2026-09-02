import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"

// ===== Score histogram =====

const HISTOGRAM_CONFIG = {
  red: { label: "Below 5", color: "var(--destructive)" },
  amber: { label: "5–7.5", color: "var(--chart-3)" },
  green: { label: "7.5+", color: "var(--chart-1)" },
} satisfies ChartConfig

export function ScoreHistogram({
  scores,
}: {
  scores: number[]
}) {
  const buckets = Array.from({ length: 10 }, (_, i) => {
    const lo = i
    const hi = i + 1
    const mid = lo + 0.5
    const count = scores.filter((s) => {
      if (i === 9) return s >= 9 && s <= 10
      return s >= lo && s < hi
    }).length
    return {
      bucket: `${lo}`,
      mid,
      count,
      tone: mid >= 7.5 ? "green" : mid >= 5 ? "amber" : "red",
    }
  })
  return (
    <ChartContainer config={HISTOGRAM_CONFIG} className="h-32 w-full">
      <BarChart data={buckets} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          stroke="var(--muted-foreground)"
          fontSize={10}
          tickFormatter={(v) => (Number(v) % 2 === 0 ? v : "")}
        />
        <YAxis hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              nameKey="count"
              formatter={(value, _name, item) => {
                const p = (item as { payload?: (typeof buckets)[number] }).payload
                if (!p) return null
                return (
                  <span className="text-foreground">
                    {p.mid.toFixed(1)} pts · {value} eval{Number(value) === 1 ? "" : "s"}
                  </span>
                )
              }}
            />
          }
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {buckets.map((b, i) => (
            <Cell key={i} fill={`var(--${b.tone === "red" ? "destructive" : `chart-${b.tone === "green" ? 1 : 3}`})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

// ===== Source / verdict donuts =====

export interface DonutDatum {
  label: string
  value: number
  /** CSS variable name (without the `var(...)` wrapper) */
  colorVar: string
}

export function Donut({
  data,
  centerLabel,
  centerValue,
  config,
}: {
  data: DonutDatum[]
  centerLabel?: string
  centerValue?: string
  config: ChartConfig
}) {
  return (
    <ChartContainer config={config} className="aspect-square h-full">
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              nameKey="value"
              formatter={(value, _name, item) => {
                const p = (item as { payload?: DonutDatum }).payload
                if (!p) return null
                return (
                  <span className="text-foreground">
                    {p.label}: {value}
                  </span>
                )
              }}
            />
          }
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="60%"
          outerRadius="90%"
          strokeWidth={2}
          stroke="var(--background)"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={`var(${entry.colorVar})`} />
          ))}
        </Pie>
      </PieChart>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-xl font-bold tabular-nums text-foreground">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </ChartContainer>
  )
}

// ===== Activity timeline =====

export interface ActivityPoint {
  date: string
  count: number
  avgScore: number | null
}

const ACTIVITY_CONFIG = {
  count: { label: "Evaluations", color: "var(--primary)" },
  avgScore: { label: "Avg score", color: "var(--chart-3)" },
} satisfies ChartConfig

export function ActivityChart({
  data,
}: {
  data: ActivityPoint[]
}) {
  return (
    <ChartContainer config={ACTIVITY_CONFIG} className="h-40 w-full">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          stroke="var(--muted-foreground)"
          fontSize={10}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis hide />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="line"
              nameKey="count"
              labelFormatter={(label) => String(label ?? "")}
              formatter={(value, name) => {
                const n = typeof name === "string" ? name : String(name ?? "")
                if (n === "avgScore") {
                  return (
                    <span className="text-foreground">
                      Avg score: {Number(value).toFixed(1)}
                    </span>
                  )
                }
                return (
                  <span className="text-foreground">
                    Evaluations: {value}
                  </span>
                )
              }}
            />
          }
        />
        <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="var(--chart-3)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
        />
      </BarChart>
    </ChartContainer>
  )
}
