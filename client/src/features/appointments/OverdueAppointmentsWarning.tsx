import { TriangleAlert } from 'lucide-react'
import { useId, useRef } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'
import type { AppointmentSummary } from './AppointmentsPage.tsx'
import { appointmentKey } from './appointment-completion.ts'
import { closeOnBackdropClick } from './dialog.ts'

export function OverdueAppointmentsWarning({
  appointments,
  profileName,
  onComplete,
  onEdit,
}: {
  appointments: AppointmentSummary[]
  profileName: (appointment: AppointmentSummary) => string
  onComplete: (appointment: AppointmentSummary) => void
  onEdit?: (appointment: AppointmentSummary) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const count = appointments.length

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
          className="flex w-full cursor-pointer items-center gap-3 rounded-control border border-danger/30 bg-danger/8 p-4 text-left text-ink hover:bg-danger/15"
        >
          <TriangleAlert className="size-5 shrink-0 text-danger" aria-hidden />
          <span>
            {count} overdue {count === 1 ? 'appointment' : 'appointments'}
          </span>
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={closeOnBackdropClick}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <h2 id={heading} className="font-display text-h2 font-bold">
          Overdue appointments
        </h2>
        {count === 0 ? (
          <p className="mt-2 text-muted" role="status">
            No overdue appointments.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-line">
            {appointments.map((appointment) => (
              <li key={appointmentKey(appointment)} className="py-4 break-words first:pt-0">
                <AppointmentListItem
                  appointment={appointment}
                  profileName={profileName(appointment)}
                  onComplete={() => onComplete(appointment)}
                  onEdit={onEdit && (() => onEdit(appointment))}
                />
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-6" onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </dialog>
    </>
  )
}
