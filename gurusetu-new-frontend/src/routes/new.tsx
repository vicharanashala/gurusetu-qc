import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { api } from "@/lib/api"
import {
  FileTextIcon,
  LoaderIcon,
  UploadIcon,
  Video,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/new")({
  component: NewAudit,
})

const SAMPLE_TEXT = `Hi everyone — quick reflection on classroom habits.

They say it takes 21 days to form a habit, and research backs this up — that's why I ask faculty to commit to one new practice for a month. Most of you are digital natives, so I'll skip the tech basics. To match each student, I design my lessons around learning styles — visual, auditory, and kinesthetic — because that is what works. In our own data over three years we saw average attention span drop from 12 to 8 seconds, so every video must be under 6 minutes. Finally, Einstein once said: insanity is doing the same thing over and over and expecting different results.`

function NewAudit() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<"text" | "youtube" | "file">("text")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // text
  const [text, setText] = useState("")
  const [title, setTitle] = useState("")
  // youtube
  const [ytUrl, setYtUrl] = useState("")
  const [ytTitle, setYtTitle] = useState("")
  // file
  const [file, setFile] = useState<File | null>(null)
  const [fileTitle, setFileTitle] = useState("")
  const [dragOver, setDragOver] = useState(false)

  const submitText = async () => {
    if (text.trim().length < 40) {
      setError("Transcript is too short. Paste at least a paragraph.")
      return
    }
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const e = await api.createFromText({
        title: title.trim() || undefined,
        text,
      })
      setSuccess(`Submitted: ${e.evaluationId.slice(0, 8)}…`)
      navigate({
        to: "/evaluations/$evaluationId",
        params: { evaluationId: e.evaluationId },
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitYoutube = async () => {
    if (!ytUrl.trim()) {
      setError("Paste a YouTube URL.")
      return
    }
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const e = await api.createFromYoutube({
        title: ytTitle.trim() || undefined,
        url: ytUrl.trim(),
      })
      setSuccess(`Submitted: ${e.evaluationId.slice(0, 8)}…`)
      navigate({
        to: "/evaluations/$evaluationId",
        params: { evaluationId: e.evaluationId },
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitFile = async () => {
    if (!file) {
      setError("Choose a file first.")
      return
    }
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      const e = await api.createFromFile(file, {
        title: fileTitle.trim() || undefined,
      })
      setSuccess(`Submitted: ${e.evaluationId.slice(0, 8)}…`)
      navigate({
        to: "/evaluations/$evaluationId",
        params: { evaluationId: e.evaluationId },
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a transcript, a YouTube URL, or an audio/video file. We'll
          extract claims, verify them, and produce the full GuruSetu rubric.
        </p>
      </div>

      <Card>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as typeof tab)
              setError(null)
              setSuccess(null)
            }}
          >
            <TabsList>
              <TabsTrigger value="text">
                <FileTextIcon className="mr-1.5 size-4" /> Text
              </TabsTrigger>
              <TabsTrigger value="youtube">
                <Video className="mr-1.5 size-4" /> YouTube
              </TabsTrigger>
              <TabsTrigger value="file">
                <UploadIcon className="mr-1.5 size-4" /> File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="t-title">Title (optional)</Label>
                  <Input
                    id="t-title"
                    placeholder="e.g. Faculty habits — quick test"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="t-text">Transcript</Label>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary"
                      onClick={() => setText(SAMPLE_TEXT)}
                    >
                      Use sample
                    </button>
                  </div>
                  <Textarea
                    id="t-text"
                    rows={14}
                    placeholder="Paste the transcript here…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {text.length.toLocaleString()} chars
                  </p>
                </div>
                <Button onClick={submitText} disabled={busy}>
                  {busy && <LoaderIcon className="size-4 animate-spin" />}
                  Run audit
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="youtube">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="y-title">Title (optional)</Label>
                  <Input
                    id="y-title"
                    placeholder="e.g. Lecture 4 — retrieval practice"
                    value={ytTitle}
                    onChange={(e) => setYtTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="y-url">YouTube URL</Label>
                  <Input
                    id="y-url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    We try auto-generated captions first (fast, free). If none are
                    available, the audio is downloaded and sent to Whisper.
                  </p>
                </div>
                <Button onClick={submitYoutube} disabled={busy}>
                  {busy && <LoaderIcon className="size-4 animate-spin" />}
                  Submit URL
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="file">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="f-title">Title (optional)</Label>
                  <Input
                    id="f-title"
                    placeholder="Defaults to the filename"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                  />
                </div>
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f) setFile(f)
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-sm transition-colors text-muted-foreground",
                    dragOver
                      ? "border-primary/60 bg-primary/5 text-primary"
                      : "border-border",
                    file && "border-solid border-secondary/40 bg-secondary/5 text-secondary-foreground",
                  )}
                >
                  <UploadIcon className="size-6" />
                  {file ? (
                    <div className="text-center">
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-xs">
                        {(file.size / 1024).toFixed(1)} KB · {file.type || "unknown type"}
                      </p>
                    </div>
                  ) : (
                    <p>
                      Drag a file here, or{" "}
                      <label className="cursor-pointer text-primary underline-offset-2 hover:underline">
                        browse
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                          accept=".txt,.md,.json,.srt,.vtt,audio/*,video/*"
                        />
                      </label>
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Audio and video need an <code className="text-foreground">OPENAI_API_KEY</code> on the server.
                  Text files (txt/md/json/srt/vtt) work without any extra setup.
                </p>
                <Button onClick={submitFile} disabled={busy || !file}>
                  {busy && <LoaderIcon className="size-4 animate-spin" />}
                  Run audit
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="mt-4 rounded-md border border-chart-1/30 bg-chart-1/10 px-3 py-2 text-sm text-chart-1">
              {success}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What happens next?</CardTitle>
          <CardDescription>
            Text and text-file submissions go straight to analysis. Audio and
            video upload transcribe first (OpenAI Whisper). YouTube first
            tries auto-generated captions; falls back to download + Whisper.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
