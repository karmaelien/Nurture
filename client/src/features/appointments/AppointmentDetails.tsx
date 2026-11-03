import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'
import { Button } from '../../components/ui/Button.tsx'

// Shared by calendar, upcoming-list, and today's dialogs so fields and completion stay consistent.
export function AppointmentDetails({
  appointment,
  profile,
  headingId,
  onComplete,
  onMarkTodo,
}: {
  appointment: AppointmentSummary
  profile: CareProfile
  headingId: string
  onComplete?: (appointment: AppointmentSummary) => void
  onMarkTodo?: (appointment: AppointmentSummary) => void
}) {
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value))
  return (
    <>
      <h2 id={headingId} className="font-display text-h2 font-bold">
        {appointment.title}
      </h2>
      <p className="mt-2 text-muted">{profile.name}</p>
      <dl className="mt-5 grid gap-4">
        <div>
          <dt className="font-semibold">Starts</dt>
          <dd>
            <time dateTime={appointment.startsAt}>{formatDate(appointment.startsAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Ends</dt>
          <dd>
            <time dateTime={appointment.endsAt}>{formatDate(appointment.endsAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Duration</dt>
          <dd>{(Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000} minutes</dd>
        </div>
        <div>
          <dt className="font-semibold">Care circle</dt>
          <dd>{profile.circleName}</dd>
        </div>
        <div>
          <dt className="font-semibold">Caregiver</dt>
          <dd>{appointment.assignedCaregiver?.name || 'Unassigned'}</dd>
        </div>
        <div>
          <dt className="font-semibold">Location</dt>
          <dd>{appointment.location || 'Not provided'}</dd>
        </div>
        <div>
          <dt className="font-semibold">Status</dt>
          <dd className="capitalize" role="status">
            {appointment.status}
          </dd>
        </div>
      </dl>
      {appointment.status === 'scheduled' && onComplete && (
        <Button className="mt-6" onClick={() => onComplete(appointment)}>
          Mark completed
        </Button>
      )}
      {appointment.status === 'completed' && onMarkTodo && (
        <Button className="mt-6" onClick={() => onMarkTodo(appointment)}>
          Mark as to do
        </Button>
      )}
    </>
  )
}
