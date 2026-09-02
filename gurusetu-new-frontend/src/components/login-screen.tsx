import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertCircleIcon,
  LoaderIcon,
  LockIcon,
  SparklesIcon,
} from "lucide-react"
import { useAuth } from "@/lib/auth"

/**
 * Full-page gate. Rendered instead of the app shell whenever there is no
 * session, so no route can be reached without authenticating.
 */
export function LoginScreen() {
  const { login, provisioned } = useAuth()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError((err as Error).message)
      setPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/20 px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
            <SparklesIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">GuruSetu</h1>
            <p className="text-sm text-muted-foreground">Quality Check</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LockIcon className="size-4 text-muted-foreground" />
              Sign in
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!provisioned ? (
              <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">
                  No admin account exists yet.
                </p>
                <p className="text-muted-foreground">
                  On the server, run:
                </p>
                <code className="block rounded bg-background/60 px-2 py-1 font-mono text-xs">
                  npm run set-password
                </code>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || password.length === 0}
                >
                  {busy && <LoaderIcon className="size-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Single-admin access · no self-registration
        </p>
      </div>
    </div>
  )
}
