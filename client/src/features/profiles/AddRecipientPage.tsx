import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { FocusLayout } from '../../layouts/FocusLayout.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { AddRecipientForm } from './AddRecipientForm.tsx'
import { profilePaths } from './paths.ts'

/** Adds someone to an existing circle, reached from the dashboard or the circle's Family page. */
export function AddRecipientPage() {
  const { circleId } = useParams()
  const { circles } = useRequiredSession()
  const navigate = useNavigate()
  const location = useLocation()
  const circle = circles.find((item) => item.id === circleId)
  if (!circle) return <Navigate to="/app" replace />

  // Return to the Family page when that's where the user came from, otherwise to the dashboard.
  const family = profilePaths.family(circle.id)
  const fromFamily = (location.state as { from?: unknown } | null)?.from === family
  const back = fromFamily ? { to: family, label: `Back to ${circle.name}` } : { to: '/app', label: 'Back to dashboard' }
  const goBack = () => navigate(back.to)
  return (
    <FocusLayout>
      <Link to={back.to} className="link inline-flex items-center gap-1.5 text-small">
        <ArrowLeft className="size-4" aria-hidden />
        {back.label}
      </Link>
      <h1 className="mt-6 font-display text-h1 font-bold">Add someone you care for</h1>
      <p className="mt-2 text-muted">They’ll be added to {circle.name}, so everyone in it can help.</p>
      <div className="mt-8">
        <AddRecipientForm circleId={circle.id} onAdded={goBack} onCancel={goBack} />
      </div>
    </FocusLayout>
  )
}
