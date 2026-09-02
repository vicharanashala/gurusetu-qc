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
  /** True only for the FIRST load, when there is nothing to show yet. */
  loading: boolean
  /** True while a background poll is in flight. Never blanks the UI. */
  refreshing: boolean
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
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  // Compared against each poll result so an unchanged payload does not produce
  // a new object identity — without this every 5s tick re-renders the whole
  // table even when nothing moved.
  const serializedRef = useRef<string | undefined>(undefined)
  const hasDataRef = useRef(false)

  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    // Only the first load may blank the UI. Later polls refresh in place, so
    // the table keeps its rows, scroll position and focus.
    if (hasDataRef.current) setRefreshing(true)
    else setLoading(true)

    fn()
      .then((res) => {
        if (ctrl.signal.aborted) return
        const next = JSON.stringify(res)
        if (next !== serializedRef.current) {
          serializedRef.current = next
          setData(res)
        }
        hasDataRef.current = true
        setError(undefined)
      })
      .catch((err) => {
        if (!ctrl.signal.aborted && !isAbortError(err)) {
          // A failed background poll must not wipe good data off the screen;
          // surface the error only when we have nothing else to show.
          if (!hasDataRef.current) setError(describeError(err))
        }
      })
      .finally(() => {
        if (ctrl.signal.aborted) return
        setLoading(false)
        setRefreshing(false)
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
    refreshing,
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

  // useAsync already polls on the interval passed above; a second interval
  // here would double the request rate for no benefit.
  return state
}

export function usePrompt() {
  return useAsync(() => api.getPrompt(), [], 0)
}

export function usePromptHistory(limit = 15) {
  return useAsync(() => api.getPromptHistory(limit), [limit], 0)
}

export type { Evaluation, StatsResponse }
