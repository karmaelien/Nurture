import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { CalendarDays, Files, LayoutDashboard, Pill, Users, Wallet } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useMatch, useParams } from 'react-router'
import { careApi } from '../api/care.ts'
import { Alert } from '../components/ui/Alert.tsx'
import { Button } from '../components/ui/Button.tsx'
import { Logo } from '../components/ui/Logo.tsx'
import { ThemeSwitch } from '../components/ui/ThemeSwitch.tsx'
import {
  AppointmentCompletionContext,
  useAppointmentCompletionState,
} from '../features/appointments/appointment-completion.ts'
import { useLogout, useRequiredSession } from '../features/auth/session.ts'
import { circleLink, useCircleSelection } from '../features/circles/selection.ts'
import { profilePaths } from '../features/profiles/paths.ts'
import { shortName } from '../features/profiles/names.ts'
import { PersonAvatar } from '../features/profiles/PersonAvatar.tsx'

const navClass = 'inline-flex flex-none items-center gap-2 whitespace-nowrap rounded-control px-3 py-2'
const activeNavClass = ({ isActive }: { isActive: boolean }) =>
  `${navClass} ${isActive ? 'bg-wash font-semibold text-primary' : 'hover:bg-wash'}`

// Keep navigation mounted across authenticated pages; each page supplies only its own content.
export function AppLayout() {
  const { user, circles } = useRequiredSession()
  const queryClient = useQueryClient()
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
  const completion = useAppointmentCompletionState(async (circleId, appointmentId, status) => {
    await careApi.updateAppointmentStatus(circleId, appointmentId, status)
    await queryClient.invalidateQueries({ queryKey: ['care', user.id, circleId, 'appointments'] })
  })
  return (
    <div className="min-h-dvh">
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
                Care
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
              <Link
                to={profilePaths.family(circle.id)}
                aria-current={inFamily ? 'page' : undefined}
                className={activeNavClass({ isActive: inFamily })}
              >
                <Users className="size-5" aria-hidden />
                Family
              </Link>
            </>
          )}
          <span className={`${navClass} text-muted`}>
            <Files className="size-5" aria-hidden />
            Documents · soon
          </span>
        </nav>
      </header>
      <AppointmentCompletionContext.Provider value={completion}>
        <Outlet />
        {completion.saveError && (
          <div className="fixed right-4 bottom-4 z-30 max-w-sm">
            <Alert tone="danger">{completion.saveError}</Alert>
          </div>
        )}
      </AppointmentCompletionContext.Provider>
      {/* Reset new-page scroll, restore history positions, and honor dashboard section links. */}
      <ScrollRestoration />
    </div>
  )
}
