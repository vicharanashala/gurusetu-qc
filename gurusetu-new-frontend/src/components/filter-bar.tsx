import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

export type SortKey =
  | "createdAt"
  | "title"
  | "sourceType"
  | "status"
  | "overallScore"
  | "progress"
export type SortDir = "asc" | "desc"

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "createdAt", label: "Created" },
  { key: "title", label: "Title" },
  { key: "sourceType", label: "Source" },
  { key: "status", label: "Status" },
  { key: "overallScore", label: "Score" },
  { key: "progress", label: "Progress" },
]

export function FilterBar({
  search,
  onSearchChange,
  hasActiveFilter,
  onClearAll,
  sortKey,
  sortDir,
  onSortChange,
}: {
  search: string
  onSearchChange: (s: string) => void
  hasActiveFilter: boolean
  onClearAll: () => void
  sortKey: SortKey
  sortDir: SortDir
  onSortChange: (k: SortKey, d: SortDir) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search title or transcript…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-input bg-input/30 pl-2 pr-1 h-9">
        <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />
        <Select
          value={sortKey}
          onValueChange={(v) => onSortChange(v as SortKey, sortDir)}
        >
          <SelectTrigger
            size="sm"
            className="border-0 bg-transparent h-7 px-1 focus:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                Sort: {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            onSortChange(sortKey, sortDir === "asc" ? "desc" : "asc")
          }
          aria-label="Toggle sort direction"
        >
          {sortDir === "asc" ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )}
        </Button>
      </div>

      {hasActiveFilter && (
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          <XIcon className="size-3.5" />
          Clear filters
        </Button>
      )}

      {!hasActiveFilter && (
        <span className="text-xs text-muted-foreground/70 ml-auto">
          Tip: type to search, click a column header to sort.
        </span>
      )}
    </div>
  )
}

export function cn_hide(): typeof cn {
  return cn
}
