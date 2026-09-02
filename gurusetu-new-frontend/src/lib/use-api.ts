// Lightweight data-fetching hooks (no @tanstack/react-query installed in
// this scaffold, so we wrap useState + useEffect with auto-refresh polling).

import { useEffect, useRef, useState } from "react"
import { api, ApiError } from "@/lib/api"
import type {
  Evaluation,
  EvaluationSourceType,
  EvaluationStatus,
  StatsResponse,
} from "@/lib/types"

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return "Unknown error"
}

interface AsyncState<T> {
  data?: T
  error?: string
  loading: boolean
  reload: () => void
}

function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  intervalMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    fn()
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setData(res)
          setError(undefined)
        }
      })
      .catch((err) => {
        if (!ctrl.signal.aborted && !isAbortError(err)) {
          setError(describeError(err))
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    if (!intervalMs) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return {
    data,
    error,
    loading,
    reload: () => setTick((t) => t + 1),
  }
}

export function useEvaluationList(params: {
  limit?: number
  status?: EvaluationStatus | null
  sourceType?: EvaluationSourceType | null
} = {}) {
  return useAsync(
    () => api.list({ limit: params.limit ?? 100 }),
    [params.limit, params.status, params.sourceType],
    5000,
  )
}

export function useEvaluationStats() {
  return useAsync(() => api.stats(), [], 5000)
}

export function useEvaluation(id: string | undefined, whileNotTerminal = true) {
  const state = useAsync(
    () => (id ? api.get(id) : Promise.reject(new Error("no id"))),
    [id],
    whileNotTerminal ? 1500 : undefined,
  )

  const isInFlight =
    state.data && ["pending", "transcribing", "analyzing"].includes(state.data.status)
  // Re-poll faster while in flight
  useEffect(() => {
    if (!isInFlight) return
    const id = setInterval(() => state.reload(), 1500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInFlight])

  return state
}

export function usePrompt() {
  return useAsync(() => api.getPrompt(), [], 0)
}

export function usePromptHistory(limit = 15) {
  return useAsync(() => api.getPromptHistory(limit), [limit], 0)
}

export type { Evaluation, StatsResponse }
