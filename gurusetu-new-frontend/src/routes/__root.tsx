import { Outlet, createRootRoute, Link } from "@tanstack/react-router"
import {
  LayoutDashboardIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
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
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Connected to <code className="text-primary">localhost:4187</code>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border/40 py-4">
        <p className="text-center text-xs text-muted-foreground">
          GuruSetu QC · backend on{" "}
          <code className="text-secondary-foreground">localhost:4187</code> ·
          frontend on{" "}
          <code className="text-secondary-foreground">localhost:4188</code>
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