import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { FocusLayout } from '../../layouts/FocusLayout.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { AddRecipientForm } from './AddRecipientForm.tsx'

/** Adds someone to an existing circle, reached from the dashboard. */
export function AddRecipientPage() {
  const { circleId } = useParams()
  const { circles } = useRequiredSession()
  const navigate = useNavigate()
  const circle = circles.find((item) => item.id === circleId)
  if (!circle) return <Navigate to="/app" replace />

  const backToDashboard = () => navigate('/app')
  return (
    <FocusLayout>
      <Link to="/app" className="link inline-flex items-center gap-1.5 text-small">
        <ArrowLeft className="size-4" aria-hidden />
        Back to dashboard
      </Link>
      <h1 className="mt-6 font-display text-h1 font-bold">Add someone you care for</h1>
      <p className="mt-2 text-muted">They’ll be added to {circle.name}, so everyone in it can help.</p>
      <div className="mt-8">
        <AddRecipientForm circleId={circle.id} onAdded={backToDashboard} onCancel={backToDashboard} />
      </div>
    </FocusLayout>
  )
}
