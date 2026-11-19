import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Files, LayoutDashboard, Wallet } from 'lucide-react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
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

const navClass = 'inline-flex items-center gap-2 rounded-control px-3 py-2'
const activeNavClass = ({ isActive }: { isActive: boolean }) =>
  `${navClass} ${isActive ? 'bg-wash font-semibold text-primary' : 'hover:bg-wash'}`

// Keep navigation mounted across authenticated pages; each page supplies only its own content.
export function AppLayout() {
  const { circles, user } = useRequiredSession()
  const queryClient = useQueryClient()
  const { circle } = useCircleSelection(circles)
  const overview = circleLink('/app', circle?.id)
  const logout = useLogout()
  const completion = useAppointmentCompletionState(async (circleId, appointmentId, status) => {
    await careApi.updateAppointmentStatus(circleId, appointmentId, status)
    await queryClient.invalidateQueries({ queryKey: ['care', user.id, circleId, 'appointments'] })
  })
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to={overview} aria-label="Nurture home" className="rounded-control">
            <Logo />
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2">
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
                <Link to={circleLink('/app/expenses', circle.id)} className={`${navClass} hover:bg-wash`}>
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
          <div className="flex items-center gap-2">
            <ThemeSwitch />
            <Button variant="secondary" loading={logout.isPending} onClick={() => logout.mutate()}>
              Log out
            </Button>
          </div>
        </div>
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
