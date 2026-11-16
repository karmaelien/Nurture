import { Navigate, Outlet } from 'react-router'
import { errorMessage } from '../api/client.ts'
import { FullPageError, FullPageSpinner } from '../components/ui/FullPageStatus.tsx'
import { useRequiredSession, useSession } from '../features/auth/session.ts'

/** Only for people who are logged out: login and registration. */
export function GuestOnly() {
  const { data: session, isPending, error, refetch } = useSession()
  if (isPending) return <FullPageSpinner />
  if (error) return <FullPageError message={errorMessage(error)} onRetry={() => refetch()} />
  // Every successful login starts at Home, including visits with an old ?next= URL.
  if (session) return <Navigate to="/app" replace />
  return <Outlet />
}

/** Requires a logged-in user. */
export function RequireSession() {
  const { data: session, isPending, error, refetch } = useSession()
  if (isPending) return <FullPageSpinner />
  if (error) return <FullPageError message={errorMessage(error)} onRetry={() => refetch()} />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Sends signed-in users without a care circle to setup. Use inside RequireSession. */
export function RequireCircle() {
  const { circles } = useRequiredSession()
  return circles.length === 0 ? <Navigate to="/setup" replace /> : <Outlet />
}
