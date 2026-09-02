import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderIcon,
  ShieldIcon,
} from "lucide-react"
import { api } from "@/lib/api"
import { useAuth } from "@/lib/auth"

const MIN_LENGTH = 12

export function ChangePasswordCard() {
  const { username } = useAuth()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && next !== confirm
  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const canSubmit =
    current.length > 0 && next.length >= MIN_LENGTH && next === confirm && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)
    setBusy(true)
    try {
      await api.changePassword(current, next)
      setCurrent("")
      setNext("")
      setConfirm("")
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldIcon className="size-4 text-muted-foreground" />
          Admin password
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Signed in as <span className="text-foreground">{username}</span>. There
          is no self-registration; this is the only account.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input
              id="next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            {tooShort && (
              <p className="text-xs text-destructive">
                At least {MIN_LENGTH} characters.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <div className="sm:col-span-3 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {busy && <LoaderIcon className="size-4 animate-spin" />}
              Change password
            </Button>
            {done && (
              <span className="flex items-center gap-1.5 text-sm text-chart-1">
                <CheckCircle2Icon className="size-4" />
                Password changed.
              </span>
            )}
            {error && (
              <span className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircleIcon className="size-4" />
                {error}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
