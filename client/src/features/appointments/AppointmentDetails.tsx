import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'

export type AppointmentDetailData = Omit<AppointmentSummary, 'endsAt'> & { endsAt?: string }

/** Calendar details reuse the list's time range, map link, warnings, and actions. */
export function AppointmentDetails<T extends AppointmentDetailData>({
  appointment,
  profile,
  overdue = false,
  onComplete,
  onMarkTodo,
  onEdit,
  onDelete,
}: {
  appointment: T
  profile: CareProfile
  overdue?: boolean
  onComplete?: (appointment: T) => void
  onMarkTodo?: (appointment: T) => void
  onEdit?: (appointment: T) => void
  onDelete?: (appointment: T) => void
}) {
  return (
    <>
      <AppointmentListItem
        appointment={appointment}
        profileName={profile.name}
        showDuration
        overdue={overdue}
        onComplete={onComplete && (() => onComplete(appointment))}
        onMarkTodo={onMarkTodo && (() => onMarkTodo(appointment))}
        onEdit={onEdit && (() => onEdit(appointment))}
        onDelete={onDelete && (() => onDelete(appointment))}
      />
    </>
  )
}
