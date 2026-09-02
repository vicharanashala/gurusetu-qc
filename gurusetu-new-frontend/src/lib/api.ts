import type {
  Evaluation,
  EvaluationSourceType,
  ListResponse,
  StatsResponse,
} from "./types"

const BASE = "/api"

/**
 * Set by the auth provider. Called whenever any request comes back 401 so the
 * UI can drop to the login screen without each caller checking for it.
 */
let onUnauthorized: (() => void) | undefined
export const setUnauthorizedHandler = (fn: (() => void) | undefined) => {
  onUnauthorized = fn
}

export interface LlmConfigView {
  protocol: "anthropic" | "openai" | "mock"
  label: string
  baseUrl: string
  model: string
  apiKeyMasked: string
  hasApiKey: boolean
  authHeader: "x-api-key" | "bearer"
  maxTokens: number
  temperature: number
  thinkingEnabled: boolean
  lastTest?: {
    at: string
    ok: boolean
    message?: string
    latencyMs?: number
    model?: string
  }
  updatedAt?: string
}

export interface LlmConfigPayload {
  protocol: "anthropic" | "openai" | "mock"
  label?: string
  baseUrl?: string
  model?: string
  /** Omit to keep the stored key; "" clears it. */
  apiKey?: string
  authHeader?: "x-api-key" | "bearer"
  maxTokens?: number
  temperature?: number
  thinkingEnabled?: boolean
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // The session is an httpOnly cookie; without this it is never sent.
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    // A 401 anywhere means the session is gone; let the app react once,
    // centrally, instead of every caller handling it.
    if (res.status === 401) onUnauthorized?.()
    const msg = (body as { message?: string | string[] })?.message ?? res.statusText
    throw new ApiError(
      res.status,
      Array.isArray(msg) ? msg.join("; ") : msg,
      body,
    )
  }
  return body as T
}

export const api = {
  health: () =>
    request<{ status: string; service: string; time: string }>("/health"),

  createFromText: (payload: {
    title?: string
    text: string
    language?: string
    tags?: string[]
  }) =>
    request<Evaluation>("/evaluations/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "text", ...payload }),
    }),

  createFromYoutube: (payload: {
    title?: string
    url: string
    tags?: string[]
  }) =>
    request<Evaluation>("/evaluations/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "youtube", ...payload }),
    }),

  createFromFile: async (
    file: File,
    meta: { title?: string; language?: string; tags?: string[] } = {},
  ): Promise<Evaluation> => {
    const form = new FormData()
    form.append("file", file)
    if (meta.title) form.append("title", meta.title)
    if (meta.language) form.append("language", meta.language)
    if (meta.tags?.length) form.append("tags", meta.tags.join(","))
    return request<Evaluation>("/evaluations/upload", {
      method: "POST",
      body: form,
    })
  },

  list: (params: {
    limit?: number
    offset?: number
    status?: string
    sourceType?: EvaluationSourceType
    search?: string
  } = {}) => {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") sp.set(k, String(v))
    })
    const qs = sp.toString()
    return request<ListResponse>(`/evaluations${qs ? `?${qs}` : ""}`)
  },

  stats: () => request<StatsResponse>("/evaluations/stats"),

  get: (id: string) => request<Evaluation>(`/evaluations/${id}`),

  rerun: (id: string) =>
    request<Evaluation>(`/evaluations/${id}/rerun`, { method: "POST" }),

  remove: (id: string) =>
    request<{ deleted: true; evaluationId: string }>(`/evaluations/${id}`, {
      method: "DELETE",
    }),

  getPrompt: () =>
    request<{
      active: {
        content: string
        versionLabel: string
        isDefault: boolean
        updatedAt?: string
        length: number
      }
      bundled: {
        content: string
        versionLabel: string
        length: number
      }
    }>("/prompts/current"),

  updatePrompt: (payload: {
    content: string
    versionLabel?: string
    note?: string
    editedBy?: { id?: string; name?: string }
  }) =>
    request<{
      versionLabel: string
      isDefault: boolean
      length: number
      updatedAt?: string
    }>("/prompts/current", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  resetPrompt: () =>
    request<{
      versionLabel: string
      isDefault: boolean
      length: number
      updatedAt?: string
    }>("/prompts/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),

  // ===== auth =====

  authStatus: () => request<{ provisioned: boolean }>("/auth/status"),

  me: () => request<{ username?: string }>("/auth/me"),

  login: (username: string, password: string) =>
    request<{ username: string; expiresAt: string; token: string }>(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
    ),

  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ===== LLM provider (BYOK) =====

  getLlmConfig: () => request<LlmConfigView>("/llm-config"),

  updateLlmConfig: (payload: LlmConfigPayload) =>
    request<LlmConfigView>("/llm-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  testLlmConfig: (payload: Partial<LlmConfigPayload> = {}) =>
    request<{ ok: boolean; message?: string; latencyMs?: number; model?: string }>(
      "/llm-config/test",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),

  getPromptHistory: (limit = 10) =>
    request<{
      items: Array<{
        versionLabel?: string
        note?: string
        editedAt?: string
        editedBy?: { id?: string; name?: string }
        length: number
        preview: string
      }>
    }>(`/prompts/history?limit=${limit}`),
}
