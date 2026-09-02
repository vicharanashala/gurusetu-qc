import { Outlet, createRootRoute, Link } from "@tanstack/react-router"
import {
  LayoutDashboardIcon,
  LoaderIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AuthProvider, useAuth } from "@/lib/auth"
import { LoginScreen } from "@/components/login-screen"
import { Button } from "@/components/ui/button"

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  ),
})

/**
 * Renders the app only for an authenticated session. Everything behind this is
 * unreachable otherwise — there is no route-level opt-out.
 */
function Gate() {
  const { authenticated, checking } = useAuth()

  if (checking && authenticated === undefined) {
    return (
      <div className="grid min-h-svh place-items-center">
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!authenticated) return <LoginScreen />

  return <RootLayout />
}

function RootLayout() {
  const { username, logout } = useAuth()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <SparklesIcon className="size-4" />
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold tracking-tight">GuruSetu</span>
              <span className="text-xs text-muted-foreground">Quality Check</span>
            </div>
          </Link>
          <nav className="ml-4 flex items-center gap-1 text-sm">
            <NavLink to="/" icon={<LayoutDashboardIcon className="size-4" />}>
              Dashboard
            </NavLink>
            <NavLink to="/new" icon={<PlusIcon className="size-4" />}>
              New audit
            </NavLink>
            <NavLink to="/settings" icon={<SettingsIcon className="size-4" />}>
              Settings
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {username && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Signed in as{" "}
                <span className="text-foreground">{username}</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOutIcon className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border/40 py-4">
        <p className="text-center text-xs text-muted-foreground">
          GuruSetu QC · quality auditing for teaching content
        </p>
      </footer>
    </div>
  )
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      activeProps={{
        className: "bg-muted text-foreground",
      }}
      inactiveProps={{
        className: "text-muted-foreground hover:text-foreground",
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
      )}
    >
      {icon}
      {children}
    </Link>
  )
}
