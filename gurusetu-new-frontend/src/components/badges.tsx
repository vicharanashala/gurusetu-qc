import { Badge } from "@/components/ui/badge"
import {
  STATUS_LABELS,
  VERDICT_LABELS,
  type EvaluationStatus,
  type OverallVerdict,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  CircleDashedIcon,
  HourglassIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react"

export function StatusBadge({
  status,
  className,
}: {
  status: EvaluationStatus
  className?: string
}) {
  const config: Record<
    EvaluationStatus,
    {
      icon: React.ComponentType<{ className?: string }>
      variant: React.ComponentProps<typeof Badge>["variant"]
      pulse?: boolean
    }
  > = {
    pending: { icon: CircleDashedIcon, variant: "outline", pulse: true },
    transcribing: { icon: HourglassIcon, variant: "secondary", pulse: true },
    analyzing: { icon: LoaderIcon, variant: "secondary", pulse: true },
    completed: { icon: CheckCircle2Icon, variant: "default" },
    failed: { icon: XCircleIcon, variant: "destructive" },
  }
  const c = config[status]
  const Icon = c.icon
  return (
    <Badge variant={c.variant} className={className}>
      <Icon
        className={cn(
          "size-3",
          c.pulse && "animate-spin [animation-duration:3s]",
        )}
      />
      {STATUS_LABELS[status]}
    </Badge>
  )
}

const VERDICT_VARIANT: Record<
  OverallVerdict,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  "accept-as-is": "default",
  "accept-with-minor-revisions": "secondary",
  "revise-before-release": "destructive",
  "blocked-on-media": "destructive",
}

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: OverallVerdict
  className?: string
}) {
  const icon = {
    "accept-as-is": <CheckCircle2Icon className="size-3" />,
    "accept-with-minor-revisions": <AlertTriangleIcon className="size-3" />,
    "revise-before-release": <XCircleIcon className="size-3" />,
    "blocked-on-media": <AlertTriangleIcon className="size-3" />,
  }[verdict]
  return (
    <Badge variant={VERDICT_VARIANT[verdict]} className={className}>
      {icon}
      {VERDICT_LABELS[verdict]}
    </Badge>
  )
}
