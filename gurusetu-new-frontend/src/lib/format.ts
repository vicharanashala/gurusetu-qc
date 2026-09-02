import { format, formatDistanceToNow } from "date-fns"

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—"
  return format(new Date(iso), "dd MMM yyyy, HH:mm")
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "—"
  return format(new Date(iso), "dd MMM yyyy")
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "—"
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function truncMiddle(s: string, max = 80): string {
  if (s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(-half)}`
}
