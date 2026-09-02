import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { NativeSelect } from "@/components/ui/native-select"
import { api } from "@/lib/api"
import type { LlmConfigPayload, LlmConfigView } from "@/lib/api"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CpuIcon,
  KeyRoundIcon,
  LoaderIcon,
  PlugZapIcon,
  SaveIcon,
} from "lucide-react"
import { formatDateTime } from "@/lib/format"

type Protocol = "anthropic" | "openai" | "mock"

/**
 * Suggested defaults per protocol. Purely a convenience for the base-URL and
 * auth-header fields — anything the admin types wins.
 */
const PRESETS: Record<
  string,
  { protocol: Protocol; baseUrl: string; authHeader: "x-api-key" | "bearer"; model: string }
> = {
  anthropic: {
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    authHeader: "x-api-key",
    model: "claude-sonnet-5",
  },
  openai: {
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    authHeader: "bearer",
    model: "gpt-4o-mini",
  },
  openrouter: {
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    authHeader: "bearer",
    model: "anthropic/claude-sonnet-4",
  },
  minimax: {
    protocol: "anthropic",
    baseUrl: "https://agent.minimax.io/mavis/api/v1/llm/v1",
    authHeader: "bearer",
    model: "MiniMax-M2.7",
  },
}

export function LlmProviderCard() {
  const [cfg, setCfg] = useState<LlmConfigView | null>(null)
  const [loading, setLoading] = useState(true)
  const [protocol, setProtocol] = useState<Protocol>("mock")
  const [label, setLabel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [authHeader, setAuthHeader] = useState<"x-api-key" | "bearer">("x-api-key")
  const [maxTokens, setMaxTokens] = useState(4096)
  const [temperature, setTemperature] = useState(0.2)
  // Empty means "leave the stored key alone" — we never receive the real one.
  const [apiKey, setApiKey] = useState("")
  const [clearKey, setClearKey] = useState(false)

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message?: string
    model?: string
  } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const c = await api.getLlmConfig()
      setCfg(c)
      setProtocol(c.protocol)
      setLabel(c.label)
      setBaseUrl(c.baseUrl)
      setModel(c.model)
      setAuthHeader(c.authHeader)
      setMaxTokens(c.maxTokens)
      setTemperature(c.temperature)
      setApiKey("")
      setClearKey(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const applyPreset = (name: string) => {
    const p = PRESETS[name]
    if (!p) return
    setProtocol(p.protocol)
    setBaseUrl(p.baseUrl)
    setAuthHeader(p.authHeader)
    setModel(p.model)
    setLabel(name.charAt(0).toUpperCase() + name.slice(1))
  }

  const buildPayload = (): LlmConfigPayload => ({
    protocol,
    label,
    baseUrl,
    model,
    authHeader: protocol === "openai" ? "bearer" : authHeader,
    maxTokens,
    temperature,
    // undefined -> keep stored key; "" -> clear it; a value -> replace it.
    apiKey: clearKey ? "" : apiKey.trim() ? apiKey.trim() : undefined,
  })

  const save = async () => {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const next = await api.updateLlmConfig(buildPayload())
      setCfg(next)
      setApiKey("")
      setClearKey(false)
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setError(null)
    setTestResult(null)
    setTesting(true)
    try {
      // Tests exactly what is on screen, so the admin can validate before saving.
      setTestResult(await api.testLlmConfig(buildPayload()))
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" /> Loading provider settings…
        </CardContent>
      </Card>
    )
  }

  const isMock = protocol === "mock"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CpuIcon className="size-4 text-muted-foreground" />
          LLM provider
          {isMock ? (
            <Badge variant="destructive">mock — no real analysis</Badge>
          ) : (
            <Badge variant="secondary">{protocol}</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Bring your own key. Anything speaking the Anthropic Messages or OpenAI
          Chat Completions protocol works — Anthropic, OpenAI, OpenRouter,
          MiniMax, or a self-hosted gateway. The key is encrypted before it is
          stored and is never sent back to this page.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Quick preset:</span>
          {Object.keys(PRESETS).map((name) => (
            <Button
              key={name}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(name)}
            >
              {name}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="protocol">Protocol</Label>
            <NativeSelect
              id="protocol"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as Protocol)}
            >
              <option value="anthropic">Anthropic Messages (/messages)</option>
              <option value="openai">
                OpenAI Chat Completions (/chat/completions)
              </option>
              <option value="mock">Mock — no API calls</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              This is the wire format, not the vendor.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder="e.g. Anthropic production"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://api.anthropic.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={isMock}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Without the endpoint path — <code>/messages</code> or{" "}
              <code>/chat/completions</code> is appended for you.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder="claude-sonnet-5"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isMock}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="authHeader">Auth header</Label>
            <NativeSelect
              id="authHeader"
              // The OpenAI protocol is always Bearer server-side, so show that
              // rather than a stale stored value the request would ignore.
              value={protocol === "openai" ? "bearer" : authHeader}
              onChange={(e) =>
                setAuthHeader(e.target.value as "x-api-key" | "bearer")
              }
              disabled={isMock || protocol === "openai"}
            >
              <option value="x-api-key">x-api-key (Anthropic direct)</option>
              <option value="bearer">Authorization: Bearer (gateways)</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {protocol === "openai"
                ? "OpenAI protocol always uses Bearer."
                : "Anthropic's own API uses x-api-key; most gateways use Bearer."}
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="apiKey" className="flex items-center gap-2">
              <KeyRoundIcon className="size-3.5" />
              API key
              {cfg?.hasApiKey && (
                <Badge variant="outline" className="font-mono text-[11px]">
                  stored: {cfg.apiKeyMasked}
                </Badge>
              )}
            </Label>
            <Input
              id="apiKey"
              type="password"
              autoComplete="off"
              placeholder={
                cfg?.hasApiKey
                  ? "Leave blank to keep the stored key"
                  : "Paste your provider API key"
              }
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setClearKey(false)
              }}
              disabled={isMock || clearKey}
              className="font-mono text-xs"
            />
            {cfg?.hasApiKey && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(e) => {
                    setClearKey(e.target.checked)
                    if (e.target.checked) setApiKey("")
                  }}
                />
                Remove the stored key
              </label>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maxTokens">Max tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              min={256}
              max={200000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              disabled={isMock}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="temperature">Temperature</Label>
            <Input
              id="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              disabled={isMock}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            Save provider
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={test}
            disabled={testing || isMock}
          >
            {testing ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <PlugZapIcon className="size-4" />
            )}
            Test connection
          </Button>
          {cfg?.lastTest && (
            <span className="text-xs text-muted-foreground">
              Last test {formatDateTime(cfg.lastTest.at)} ·{" "}
              {cfg.lastTest.ok ? "passed" : "failed"}
            </span>
          )}
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-md border border-chart-1/30 bg-chart-1/10 px-3 py-2 text-sm text-chart-1">
            <CheckCircle2Icon className="size-4" />
            Saved. The next evaluation will use this provider.
          </div>
        )}

        {testResult && (
          <div
            className={
              testResult.ok
                ? "flex items-start gap-2 rounded-md border border-chart-1/30 bg-chart-1/10 px-3 py-2 text-sm text-chart-1"
                : "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {testResult.ok ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            )}
            <span className="break-all">
              {testResult.ok ? "Connection OK" : "Connection failed"}
              {testResult.model ? ` (${testResult.model})` : ""}
              {testResult.message ? ` — ${testResult.message}` : ""}
            </span>
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
  )
}
