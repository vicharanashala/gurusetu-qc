import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item"
import { GaugeIcon } from "lucide-react"
import type { Scorecard } from "@/lib/types"

/**
 * Ten axes as ten separate number cards made them impossible to compare — the
 * question is always "which axis is dragging the score down", and that needs
 * the axes side by side on a shared scale. One card, one row per axis, with a
 * bar you can scan down.
 *
 * Descriptions are the rubric's own definitions, so the reader does not have to
 * guess what "epistemic hygiene" is measuring.
 */
const AXES: Array<{
  key: keyof Scorecard
  label: string
  description: string
}> = [
  {
    key: "factualAccuracy",
    label: "Factual accuracy",
    description: "Are the claims true against the best available evidence?",
  },
  {
    key: "evidenceGrounding",
    label: "Evidence grounding",
    description: "Are claims tied to named studies, data or authorities?",
  },
  {
    key: "citationHygiene",
    label: "Citation hygiene",
    description: "Attribution quality — misattribution is worse than none.",
  },
  {
    key: "epistemicHygiene",
    label: "Epistemic hygiene",
    description: "Are opinions and uncertainty labelled as such?",
  },
  {
    key: "pedagogicalSoundness",
    label: "Pedagogical soundness",
    description: "Does the teaching approach hold up as instruction?",
  },
  {
    key: "internalCoherence",
    label: "Internal coherence",
    description: "Does the argument stay consistent with itself?",
  },
  {
    key: "deliveryCleanliness",
    label: "Delivery cleanliness",
    description: "Clarity of delivery, free of garbles and lost sections.",
  },
  {
    key: "currency",
    label: "Currency",
    description: "Is the material up to date? Situational — may be unscored.",
  },
  {
    key: "localization",
    label: "Localization",
    description: "Fit for the local context. Situational — may be unscored.",
  },
  {
    key: "editorialNeutrality",
    label: "Editorial neutrality",
    description: "Free of undue bias. Situational — may be unscored.",
  },
]

const toneFor = (v: number) =>
  v >= 7.5
    ? "text-verdict-green"
    : v >= 5
      ? "text-verdict-amber"
      : "text-verdict-red"

const barFor = (v: number) =>
  v >= 7.5
    ? "[&_[data-slot=progress-indicator]]:bg-verdict-green"
    : v >= 5
      ? "[&_[data-slot=progress-indicator]]:bg-verdict-amber"
      : "[&_[data-slot=progress-indicator]]:bg-verdict-red"

export function ScorecardPanel({ scorecard }: { scorecard: Scorecard }) {
  const scored = AXES.filter(({ key }) => scorecard[key] != null)
  const unscored = AXES.filter(({ key }) => scorecard[key] == null)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GaugeIcon className="size-4 text-muted-foreground" />
            Rubric axes
            <Badge variant="outline">{scored.length} scored</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {scored.map(({ key, label, description }, i) => {
              const value = scorecard[key] as number
              return (
                <div key={key}>
                  {i > 0 && <ItemSeparator />}
                  <Item size="sm">
                    <ItemContent className="gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <ItemTitle>{label}</ItemTitle>
                        <span
                          className={`shrink-0 text-sm font-semibold tabular-nums ${toneFor(value)}`}
                        >
                          {value.toFixed(1)}
                          <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                            /10
                          </span>
                        </span>
                      </div>
                      <Progress
                        value={value * 10}
                        className={`[&_[data-slot=progress-track]]:h-1.5 ${barFor(value)}`}
                      />
                      <ItemDescription>{description}</ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
              )
            })}
          </ItemGroup>
        </CardContent>
      </Card>

      {unscored.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Not scored</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {/* These axes are situational in the rubric; the model returns null
                when they do not apply, which is different from scoring zero. */}
            {unscored.map(({ key, label }) => (
              <Badge key={key} variant="outline" className="font-normal text-muted-foreground">
                {label}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
