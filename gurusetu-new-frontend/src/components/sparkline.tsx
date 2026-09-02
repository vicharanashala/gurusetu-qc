import { cn } from "@/lib/utils"

/**
 * Tiny SVG sparkline. Colors come from CSS variables so the theme drives it.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = "primary",
  filled = true,
  className,
  showDots = false,
}: {
  values: number[]
  width?: number
  height?: number
  tone?: "primary" | "chart-1" | "chart-2" | "chart-3" | "chart-5"
  filled?: boolean
  className?: string
  showDots?: boolean
}) {
  if (!values || values.length < 2) {
    return (
      <div
        className={cn("text-[10px] text-muted-foreground/60", className)}
        style={{ width, height }}
      />
    )
  }

  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = w / (values.length - 1)

  const points = values.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + h - ((v - min) / range) * h
    return [x, y] as const
  })

  const linePath = points
    .map(
      ([x, y], i) =>
        `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`,
    )
    .join(" ")

  const fillPath = `${linePath} L${(pad + w).toFixed(1)},${(pad + h).toFixed(1)} L${pad.toFixed(1)},${(pad + h).toFixed(1)} Z`

  const strokeVar = `var(--${tone})`
  const gradId = `spark-${tone}-${values.length}-${width}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn(className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor={strokeVar}
            style={{ stopOpacity: 0.35 }}
          />
          <stop
            offset="100%"
            stopColor={strokeVar}
            style={{ stopOpacity: 0 }}
          />
        </linearGradient>
      </defs>
      {filled && <path d={fillPath} fill={`url(#${gradId})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={strokeVar}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots &&
        points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.5} fill={strokeVar} />
        ))}
    </svg>
  )
}
