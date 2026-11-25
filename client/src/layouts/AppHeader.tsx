import { clsx } from 'clsx'
import { CalendarDays, Files, LayoutDashboard, Pill, Users, Wallet } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, NavLink, useLocation, useMatch, useParams } from 'react-router'
import { Button } from '../components/ui/Button.tsx'
import { Logo } from '../components/ui/Logo.tsx'
import { ThemeSwitch } from '../components/ui/ThemeSwitch.tsx'
import { useLogout, useRequiredSession } from '../features/auth/session.ts'
import { circleLink, useCircleSelection } from '../features/circles/selection.ts'
import { profilePaths } from '../features/profiles/paths.ts'
import { shortName } from '../features/profiles/names.ts'
import { PersonAvatar } from '../features/profiles/PersonAvatar.tsx'

const navClass = 'inline-flex flex-none items-center gap-2 whitespace-nowrap rounded-control px-3 py-2'
const activeNavClass = ({ isActive }: { isActive: boolean }) =>
  `${navClass} ${isActive ? 'bg-wash font-semibold text-primary' : 'hover:bg-wash'}`

export function AppHeader() {
  const { user, circles } = useRequiredSession()
  const selection = useCircleSelection(circles)
  // Pages under /app/circles/:circleId are about that circle, so the nav follows it.
  const { circleId } = useParams()
  const circle = circles.find((item) => item.id === circleId) ?? selection.circle
  // Family stays highlighted on every person and caregiver page in the circle.
  const inFamily = useMatch('/app/circles/:circleId/*') !== null
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useEffect(() => {
    // On phones the tabs scroll sideways; bring the current one into view.
    const list = nav.current
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (list && current) list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
  }, [pathname])
  const overview = circleLink('/app', circle?.id)
  const logout = useLogout()
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-4 pb-2 sm:px-8 sm:pt-5">
        <Link to={overview} aria-label="Nurture home" className="rounded-control">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <NavLink
            to={profilePaths.me}
            // Includes the visible first name, so voice control users can say what they see.
            aria-label={`${shortName(user.name)}, my profile`}
            className={({ isActive }) =>
              clsx(
                'inline-flex h-11 items-center gap-2 rounded-control border px-1.5 font-semibold sm:pr-3.5',
                isActive ? 'border-primary bg-wash text-primary' : 'border-line-strong bg-surface hover:bg-wash',
              )
            }
          >
            <PersonAvatar name={user.name} size="sm" kind="caregiver" />
            <span className="max-sm:hidden">{shortName(user.name)}</span>
          </NavLink>
          <ThemeSwitch />
          {/* On phones Log out lives on My profile, so the top row fits. */}
          <Button
            variant="secondary"
            loading={logout.isPending}
            onClick={() => logout.mutate()}
            className="max-sm:hidden"
          >
            Log out
          </Button>
        </div>
      </div>
      {/* A second row, so new sections never push the account controls onto another line.
            Centered once it fits (lg and up); narrower screens scroll it sideways from the first tab. */}
      <nav
        ref={nav}
        aria-label="Main navigation"
        className="relative mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none] sm:px-8 lg:flex-wrap lg:justify-center lg:overflow-visible"
      >
        <NavLink to={overview} end className={activeNavClass}>
          <LayoutDashboard className="size-5" aria-hidden />
          Overview
        </NavLink>
        {circle && (
          <>
            <Link to={`${overview}#tasks`} className={`${navClass} hover:bg-wash`}>
              <CalendarDays className="size-5" aria-hidden />
              Tasks
            </Link>
            <NavLink to={circleLink('/app/appointments', circle.id)} className={activeNavClass}>
              <CalendarDays className="size-5" aria-hidden />
              Appointments
            </NavLink>
            <NavLink to={circleLink('/app/medications', circle.id)} className={activeNavClass}>
              <Pill className="size-5" aria-hidden />
              Medications
            </NavLink>
            <NavLink to={circleLink('/app/expenses', circle.id)} className={activeNavClass}>
              <Wallet className="size-5" aria-hidden />
              Expenses
            </NavLink>
          </>
        )}
        <NavLink to={circleLink('/app/documents', circle?.id)} className={activeNavClass}>
          <Files className="size-5" aria-hidden />
          Documents
        </NavLink>
        {circle && (
          <Link
            to={profilePaths.family(circle.id)}
            aria-current={inFamily ? 'page' : undefined}
            className={activeNavClass({ isActive: inFamily })}
          >
            <Users className="size-5" aria-hidden />
            Family
          </Link>
        )}
      </nav>
    </header>
  )
}
