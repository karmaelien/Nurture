import { CalendarDays, Files, LayoutDashboard, Wallet } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { Logo } from '../components/ui/Logo.tsx'
import { useLogout, useRequiredSession } from '../features/auth/session.ts'

const navClass = 'inline-flex items-center gap-2 rounded-control px-3 py-2'
const activeNavClass = ({ isActive }: { isActive: boolean }) =>
  `${navClass} ${isActive ? 'bg-wash font-semibold text-primary' : 'hover:bg-wash'}`

// Keep navigation mounted across authenticated pages; each page supplies only its own content.
export function AppLayout() {
  const { circles } = useRequiredSession()
  const logout = useLogout()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/app" aria-label="Nurture home" className="rounded-control">
            <Logo />
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
            <NavLink to="/app" end className={activeNavClass}>
              <LayoutDashboard className="size-5" aria-hidden />
              Overview
            </NavLink>
            {circles.length > 0 && (
              <>
                <Link to="/app#tasks" className={`${navClass} hover:bg-wash`}>
                  <CalendarDays className="size-5" aria-hidden />
                  Care
                </Link>
                <NavLink to="/app/appointments" className={activeNavClass}>
                  <CalendarDays className="size-5" aria-hidden />
                  Appointments
                </NavLink>
                <Link to="/app#expenses" className={`${navClass} hover:bg-wash`}>
                  <Wallet className="size-5" aria-hidden />
                  Expenses
                </Link>
              </>
            )}
            <span className="inline-flex items-center gap-2 px-3 py-2 text-muted">
              <Files className="size-5" aria-hidden />
              Documents · soon
            </span>
          </nav>
          <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </header>
      <Outlet />
      {/* Reset new-page scroll, restore history positions, and honor dashboard section links. */}
      <ScrollRestoration />
    </div>
  )
}
