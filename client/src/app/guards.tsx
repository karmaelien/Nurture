import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { errorMessage } from '../api/client.ts'
import { FullPageError, FullPageSpinner } from '../components/ui/FullPageStatus.tsx'
import { safeNext, useRequiredSession, useSession } from '../features/auth/session.ts'

/** Only for people who are logged out: login and registration. */
export function GuestOnly() {
  const { data: session, isPending, error, refetch } = useSession()
  const [params] = useSearchParams()
  if (isPending) return <FullPageSpinner />
  if (error) return <FullPageError message={errorMessage(error)} onRetry={() => refetch()} />
  if (session) return <Navigate to={safeNext(params.get('next')) ?? '/app'} replace />
  return <Outlet />
}

/** Requires a logged-in user. */
export function RequireSession() {
  const { data: session, isPending, error, refetch } = useSession()
  const location = useLocation()
  if (isPending) return <FullPageSpinner />
  if (error) return <FullPageError message={errorMessage(error)} onRetry={() => refetch()} />
  if (!session) {
    // /app is where login goes anyway, so only remember other destinations.
    const next = location.pathname + location.search
    return <Navigate to={next === '/app' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

/** Sends signed-in users without a care circle to setup. Use inside RequireSession. */
export function RequireCircle() {
  const { circles } = useRequiredSession()
  return circles.length === 0 ? <Navigate to="/setup" replace /> : <Outlet />
}
