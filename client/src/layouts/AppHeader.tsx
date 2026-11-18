import { CalendarDays, Files, LayoutDashboard, ListChecks, Wallet } from 'lucide-react'
import { Link, NavLink, useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { Logo } from '../components/ui/Logo.tsx'
import { ThemeSwitch } from '../components/ui/ThemeSwitch.tsx'
import { useLogout, useRequiredSession } from '../features/auth/session.ts'
import { circleLink } from '../features/circles/selection.ts'

const links = [
  { to: '/app', label: 'Overview', Icon: LayoutDashboard },
  { to: '/app/appointments', label: 'Appointments', Icon: CalendarDays },
  { to: '/app', label: 'Tasks', Icon: ListChecks, hash: '#tasks' },
  { to: '/app/expenses', label: 'Expenses', Icon: Wallet },
  { to: '/app/documents', label: 'Documents', Icon: Files },
]
export function AppHeader() {
  const { circles } = useRequiredSession()
  const [params] = useSearchParams()
  const circleId = params.get('circleId') ?? circles[0]?.id
  const logout = useLogout()
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
          {links.map(({ to, label, Icon, hash }) =>
            hash ? (
              <Link
                key={label}
                to={`${circleLink(to, circleId)}${hash}`}
                className="inline-flex items-center gap-2 rounded-control px-3 py-2 hover:bg-wash"
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            ) : (
              <NavLink
                key={to}
                end
                to={circleLink(to, circleId)}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-control px-3 py-2 ${isActive ? 'bg-wash font-semibold text-primary' : 'hover:bg-wash'}`
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  )
}
