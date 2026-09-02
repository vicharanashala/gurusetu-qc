import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { api } from "@/lib/api"
import { usePrompt, usePromptHistory } from "@/lib/use-api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  EyeIcon,
  HistoryIcon,
  LoaderIcon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
} from "lucide-react"
import { formatDateTime, formatRelative } from "@/lib/format"
import { LlmProviderCard } from "@/components/llm-provider-card"
import { ChangePasswordCard } from "@/components/change-password-card"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/settings")({
  component: Settings,
})

function Settings() {
  const prompt = usePrompt()
  const history = usePromptHistory(15)
  const [draft, setDraft] = useState("")
  const [versionLabel, setVersionLabel] = useState("")
  const [note, setNote] = useState("")
  const [dirty, setDirty] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (prompt.data && !dirty) {
      setDraft(prompt.data.active.content)
      setVersionLabel(prompt.data.active.versionLabel ?? "")
    }
  }, [prompt.data, dirty])

  const isDirty = Boolean(
    prompt.data &&
      (draft !== prompt.data.active.content ||
        versionLabel !== (prompt.data.active.versionLabel ?? "")),
  )

  useEffect(() => {
    setDirty(isDirty)
  }, [isDirty])

  const save = async () => {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await api.updatePrompt({
        content: draft,
        versionLabel: versionLabel.trim() || undefined,
        note: note.trim() || undefined,
      })
      setNote("")
      setSaved(true)
      prompt.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    setError(null)
    setResetting(true)
    try {
      await api.resetPrompt()
      prompt.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setResetting(false)
      setConfirmReset(false)
    }
  }

  const restoreBundled = () => {
    if (prompt.data) {
      setDraft(prompt.data.bundled.content)
      setVersionLabel(prompt.data.bundled.versionLabel)
    }
  }

  if (prompt.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (prompt.error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertCircleIcon className="size-4" />
        {prompt.error}
      </div>
    )
  }

  const data = prompt.data!
  const diff = draft.length - data.active.content.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={
            <Link to="/">
              <ArrowLeftIcon className="size-4" />
              Back to dashboard
            </Link>
          }
        />
        <div className="flex items-center gap-2">
          {isDirty && (
            <Badge variant="secondary">
              <PencilIcon className="size-3" />
              Unsaved changes
            </Badge>
          )}
          {data.active.isDefault ? (
            <Badge variant="outline">default</Badge>
          ) : (
            <Badge variant="secondary">custom</Badge>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Provider credentials, the admin password, and the QC system prompt.
          All of it takes effect on the next evaluation — no server restart
          needed.
        </p>
      </div>

      <LlmProviderCard />

      <ChangePasswordCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            System prompt
            <Badge variant="outline" className="font-mono">
              v{data.active.versionLabel}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Active: {data.active.length.toLocaleString()} chars · last updated{" "}
            {data.active.updatedAt ? formatRelative(data.active.updatedAt) : "—"}{" "}
            ({data.active.updatedAt ? formatDateTime(data.active.updatedAt) : "—"})
            {diff !== 0 && (
              <span
                className={cn(
                  "ml-2",
                  diff > 0 ? "text-chart-3" : "text-secondary-foreground",
                )}
              >
                ({diff > 0 ? "+" : ""}
                {diff.toLocaleString()} from saved)
              </span>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label htmlFor="version">Version label</Label>
              <Input
                id="version"
                placeholder="e.g. strict-mode-2026-08"
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label htmlFor="note">Change note (optional)</Label>
              <Input
                id="note"
                placeholder="why this change?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 self-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode((v) => !v)}
              >
                {previewMode ? (
                  <PencilIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
                {previewMode ? "Edit" : "Preview"}
              </Button>
              <Button
                size="sm"
                disabled={!isDirty || draft.trim().length < 100 || saving}
                onClick={save}
              >
                {saving ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <SaveIcon className="size-4" />
                )}
                Save prompt
              </Button>
            </div>
          </div>

          {previewMode ? (
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono max-h-[480px] overflow-auto">
                {draft}
              </pre>
            </div>
          ) : (
            <Textarea
              rows={20}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-[13px] leading-relaxed"
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground">
              {draft.length.toLocaleString()} characters ·{" "}
              {draft.split(/\s+/).filter(Boolean).length.toLocaleString()} words
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={restoreBundled}
                disabled={draft === data.bundled.content}
              >
                Restore bundled default (preview)
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmReset(true)}
                disabled={data.active.isDefault || resetting}
              >
                {resetting ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <RotateCcwIcon className="size-4" />
                )}
                Reset to bundled default
              </Button>
            </div>
          </div>

          {saved && (
            <div className="flex items-center gap-2 rounded-md border border-chart-1/30 bg-chart-1/10 px-3 py-2 text-sm text-chart-1">
              <CheckCircle2Icon className="size-4" />
              Saved. Next evaluation will use the new prompt.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon className="size-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4 text-muted-foreground" />
            Recent edits
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Last {history.data?.items.length ?? 0} edits (most recent first).
          </p>
        </CardHeader>
        <CardContent>
          {history.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" /> Loading…
            </div>
          ) : history.data && history.data.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {history.data.items.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="font-mono">
                        {h.versionLabel ?? "unknown"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {h.editedAt
                          ? `${formatDateTime(h.editedAt)} · ${formatRelative(h.editedAt)}`
                          : "—"}
                      </span>
                      {h.editedBy?.name && (
                        <span className="text-secondary-foreground">
                          by {h.editedBy.name}
                        </span>
                      )}
                    </div>
                    {h.note && (
                      <p className="mt-1 text-sm">{h.note}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 font-mono">
                      {h.preview}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {h.length.toLocaleString()} chars
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No edits yet.</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to bundled default?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the active prompt with the bundled default.
              Your saved overrides will be preserved in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>
              <CheckCircle2Icon className="size-4" />
              Yes, reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
