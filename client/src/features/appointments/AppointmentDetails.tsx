import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'
import { Button } from '../../components/ui/Button.tsx'

// Shared by calendar, upcoming-list, and today's dialogs so fields and completion stay consistent.
export type AppointmentDetailData = Omit<AppointmentSummary, 'endsAt'> & { endsAt?: string }

export function AppointmentDetails<T extends AppointmentDetailData>({
  appointment,
  profile,
  headingId,
  onComplete,
  onMarkTodo,
  onEdit,
  onDelete,
}: {
  appointment: T
  profile: CareProfile
  headingId: string
  onComplete?: (appointment: T) => void
  onMarkTodo?: (appointment: T) => void
  onEdit?: (appointment: T) => void
  onDelete?: (appointment: T) => void
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
            {appointment.endsAt ? (
              <time dateTime={appointment.endsAt}>{formatDate(appointment.endsAt)}</time>
            ) : (
              'Not provided'
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Duration</dt>
          <dd>
            {appointment.endsAt
              ? `${(Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000} minutes`
              : 'Not provided'}
          </dd>
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
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {appointment.status === 'scheduled' && onComplete && (
          <Button variant="outline" onClick={() => onComplete(appointment)}>
            Mark completed
          </Button>
        )}
        {appointment.status === 'completed' && onMarkTodo && (
          <Button variant="outline" onClick={() => onMarkTodo(appointment)}>
            Mark as to do
          </Button>
        )}
        {onEdit && (
          <Button variant="outline" onClick={() => onEdit(appointment)}>
            Edit appointment
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" onClick={() => onDelete(appointment)}>
            Delete appointment
          </Button>
        )}
      </div>
    </>
  )
}
