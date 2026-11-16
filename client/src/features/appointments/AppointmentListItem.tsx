import { CircleCheck, MapPin, Users } from 'lucide-react'
import type { AppointmentDetailData } from './AppointmentDetails.tsx'
import { AppointmentStatus } from './AppointmentStatus.tsx'
import { Button } from '../../components/ui/Button.tsx'

function formatAppointmentRange(startsAt: string, endsAt?: string) {
  const start = new Date(startsAt)
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
  if (!endsAt) return `${date.format(start)} · ${time.format(start)}`
  const end = new Date(endsAt)
  // Show a shared local date once, but keep both dates when the appointment crosses midnight.
  if (start.toDateString() === end.toDateString()) return `${date.format(start)} · ${time.formatRange(start, end)}`
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).formatRange(start, end)
}

// Shared list content keeps date, location, caregiver, and status consistent across appointment lists.
export function AppointmentListItem({
  appointment,
  profileName,
  onComplete,
  onMarkTodo,
}: {
  appointment: AppointmentDetailData
  profileName: string
  onComplete?: () => void
  onMarkTodo?: () => void
}) {
  return (
    <>
      <span className="block font-display text-h3 font-semibold">
        {appointment.title}
        {appointment.status === 'completed' && (
          <CircleCheck
            role="img"
            aria-label="Completed"
            className="ml-2 inline-block size-5 align-text-bottom text-primary"
          />
        )}
      </span>
      <span className="mt-1 block">{profileName}</span>
      <span className="mt-2 block text-muted">{formatAppointmentRange(appointment.startsAt, appointment.endsAt)}</span>
      <span className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-muted">
        <span className="inline-flex min-w-0 items-start gap-2">
          <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
          {appointment.location ? (
            <a
              aria-label={`Location: ${appointment.location}`}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-control underline underline-offset-2 hover:text-primary"
            >
              <span className="sr-only">Location: </span>
              {appointment.location}
            </a>
          ) : (
            <span>Location not provided</span>
          )}
        </span>
        <span className="inline-flex min-w-0 items-start gap-2">
          <Users className="mt-1 size-4 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Caregiver: </span>
            {appointment.assignedCaregiver?.name || 'Unassigned'}
          </span>
        </span>
      </span>
      {appointment.status === 'scheduled' && onComplete ? (
        <Button variant="primary" size="sm" className="mt-2" onClick={onComplete}>
          Mark completed
        </Button>
      ) : appointment.status === 'completed' && onMarkTodo ? (
        <Button variant="primary" size="sm" className="mt-2" onClick={onMarkTodo}>
          Mark as to do
        </Button>
      ) : (
        <AppointmentStatus status={appointment.status} />
      )}
    </>
  )
}
