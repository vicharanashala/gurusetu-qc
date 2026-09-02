import { useMemo, useState } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import {
  AnchorIcon,
  BookOpenIcon,
  PencilLineIcon,
  SearchIcon,
  ShieldAlertIcon,
  TagIcon,
} from "lucide-react"
import type { ClaimItem, Tally } from "@/lib/types"

type VerdictFilter = "all" | "green" | "amber" | "red"

const VERDICT_STYLE: Record<
  ClaimItem["verdict"],
  { label: string; className: string; dot: string }
> = {
  green: {
    label: "Green",
    className: "bg-verdict-green/15 text-verdict-green border-verdict-green/30",
    dot: "bg-verdict-green",
  },
  amber: {
    label: "Amber",
    className: "bg-verdict-amber/15 text-verdict-amber border-verdict-amber/30",
    dot: "bg-verdict-amber",
  },
  red: {
    label: "Red",
    className: "bg-verdict-red/15 text-verdict-red border-verdict-red/30",
    dot: "bg-verdict-red",
  },
}

/**
 * Claims used to be a five-column table with prose in two of them (claim and
 * basis), which forced horizontal scrolling on any real transcript. A claim is
 * a document, not a row: the headline is the claim plus its verdict, and the
 * supporting detail belongs underneath, revealed on demand.
 */
export function ClaimsList({
  claims,
  tally,
}: {
  claims: ClaimItem[]
  tally?: Tally
}) {
  const [query, setQuery] = useState("")
  const [verdict, setVerdict] = useState<VerdictFilter>("all")
  const [flagged, setFlagged] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return claims.filter((c) => {
      if (verdict !== "all" && c.verdict !== verdict) return false
      if (flagged && !c.loadBearing && !c.knownMyth) return false
      if (q) {
        const hay = `${c.claim} ${c.basis} ${c.correction ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [claims, query, verdict, flagged])

  if (!claims.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenIcon />
          </EmptyMedia>
          <EmptyTitle>No claims extracted</EmptyTitle>
          <EmptyDescription>
            The transcript had no claimable statements.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const counts = {
    all: claims.length,
    green: tally?.green ?? claims.filter((c) => c.verdict === "green").length,
    amber: tally?.amber ?? claims.filter((c) => c.verdict === "amber").length,
    red: tally?.red ?? claims.filter((c) => c.verdict === "red").length,
  }
  const flaggedCount = claims.filter((c) => c.loadBearing || c.knownMyth).length

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3">
          <InputGroup className="min-w-[220px] flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search claims, basis or corrections…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </InputGroup>

          <ToggleGroup
            value={[verdict]}
            onValueChange={(v) =>
              setVerdict(((v as string[])[0] as VerdictFilter) ?? "all")
            }
            className="shrink-0"
          >
            {(["all", "green", "amber", "red"] as const).map((v) => (
              <ToggleGroupItem key={v} value={v} className="gap-1.5 capitalize">
                {v !== "all" && (
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${VERDICT_STYLE[v].dot}`}
                  />
                )}
                {v}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {counts[v]}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <ToggleGroup
            value={flagged ? ["flagged"] : []}
            onValueChange={(v) => setFlagged((v as string[]).includes("flagged"))}
            className="shrink-0"
          >
            <ToggleGroupItem value="flagged" className="gap-1.5">
              <ShieldAlertIcon className="size-3.5" />
              Flagged
              <span className="font-mono text-[10px] text-muted-foreground">
                {flaggedCount}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {claims.length} claims
      </p>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No claims match these filters</EmptyTitle>
            <EmptyDescription>
              Clear the search or pick a different verdict.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Accordion multiple>
          {filtered.map((c) => {
            const style = VERDICT_STYLE[c.verdict]
            return (
              <AccordionItem key={c.index} value={String(c.index)}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{c.index}
                      </span>
                      <Badge variant="outline" className={style.className}>
                        <span
                          aria-hidden
                          className={`size-1.5 rounded-full ${style.dot}`}
                        />
                        {style.label}
                      </Badge>
                      {c.loadBearing && (
                        <Badge variant="secondary" className="gap-1">
                          <AnchorIcon className="size-3" />
                          Load-bearing
                        </Badge>
                      )}
                      {c.knownMyth && (
                        <Badge variant="outline" className="gap-1">
                          <ShieldAlertIcon className="size-3" />
                          Known myth
                        </Badge>
                      )}
                      {c.speakerCategory && (
                        <Badge variant="outline" className="gap-1 font-normal">
                          <TagIcon className="size-3" />
                          {c.speakerCategory}
                        </Badge>
                      )}
                    </div>
                    {/* Full text, wrapping — the whole point of dropping the
                        table. Nothing is truncated and nothing scrolls sideways. */}
                    <p className="text-sm font-normal leading-relaxed text-foreground">
                      {c.claim}
                    </p>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="space-y-4">
                  <Separator />
                  <Item variant="muted" size="sm">
                    <ItemContent>
                      <ItemTitle className="flex items-center gap-1.5">
                        <BookOpenIcon className="size-3.5 text-muted-foreground" />
                        Basis
                      </ItemTitle>
                      <ItemDescription className="leading-relaxed">
                        {c.basis || "No basis provided."}
                      </ItemDescription>
                    </ItemContent>
                  </Item>

                  {c.correction && (
                    <Item variant="muted" size="sm">
                      <ItemContent>
                        <ItemTitle className="flex items-center gap-1.5">
                          <PencilLineIcon className="size-3.5 text-verdict-amber" />
                          Suggested correction
                        </ItemTitle>
                        <ItemDescription className="leading-relaxed">
                          {c.correction}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
}
