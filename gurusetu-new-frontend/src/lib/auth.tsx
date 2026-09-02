import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { api, ApiError, setUnauthorizedHandler } from "@/lib/api"

interface AuthState {
  username?: string
  /** undefined while the initial session check is still in flight. */
  authenticated?: boolean
  /** False when no admin credential has been provisioned on the server yet. */
  provisioned: boolean
  checking: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | undefined>()
  const [authenticated, setAuthenticated] = useState<boolean | undefined>()
  const [provisioned, setProvisioned] = useState(true)
  const [checking, setChecking] = useState(true)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const me = await api.me()
      setUsername(me.username)
      setAuthenticated(Boolean(me.username))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthenticated(false)
        setUsername(undefined)
      } else {
        // A network/server failure is not the same as "logged out" — treat it
        // as unauthenticated for routing, but don't wipe a valid session.
        setAuthenticated(false)
      }
    } finally {
      setChecking(false)
    }
    try {
      const s = await api.authStatus()
      setProvisioned(s.provisioned)
    } catch {
      // Non-fatal: the login screen just won't show the "not provisioned" hint.
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  // Any 401 from anywhere in the app drops us back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthenticated(false)
      setUsername(undefined)
    })
    return () => setUnauthorizedHandler(undefined)
  }, [])

  const login = useCallback(async (u: string, p: string) => {
    const res = await api.login(u, p)
    setUsername(res.username)
    setAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAuthenticated(false)
      setUsername(undefined)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ username, authenticated, provisioned, checking, login, logout }),
    [username, authenticated, provisioned, checking, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
