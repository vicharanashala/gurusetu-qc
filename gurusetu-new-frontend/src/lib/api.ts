import type {
  Evaluation,
  EvaluationSourceType,
  ListResponse,
  StatsResponse,
} from "./types"

const BASE = "/api"

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
