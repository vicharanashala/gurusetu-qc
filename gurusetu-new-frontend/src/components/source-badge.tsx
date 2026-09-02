import { Badge } from "@/components/ui/badge"
import type { EvaluationSourceType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FileTextIcon, Video, FileAudioIcon, FileVideoIcon } from "lucide-react"

const META: Record<
  EvaluationSourceType,
  {
    icon: React.ComponentType<{ className?: string }>
    label: string
    iconClass: string
  }
> = {
  text: { icon: FileTextIcon, label: "Text", iconClass: "text-chart-2" },
  file_audio: { icon: FileAudioIcon, label: "Audio", iconClass: "text-chart-1" },
  file_video: { icon: FileVideoIcon, label: "Video", iconClass: "text-chart-3" },
  file_text: { icon: FileTextIcon, label: "Text file", iconClass: "text-chart-5" },
  youtube: { icon: Video, label: "YouTube", iconClass: "text-destructive" },
}

export function SourceBadge({
  sourceType,
  className,
  showLabel = true,
}: {
  sourceType: EvaluationSourceType
  className?: string
  showLabel?: boolean
}) {
  const meta = META[sourceType]
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <Icon className={cn("size-3", meta.iconClass)} />
      {showLabel && <span>{meta.label}</span>}
    </Badge>
  )
}
