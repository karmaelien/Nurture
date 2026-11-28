import { AttentionNeeded } from '../../components/ui/AttentionNeeded.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'
import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'
import { appointmentKey } from './appointment-completion.ts'

export function AppointmentAttention({
  today,
  overdue,
  profiles,
  onComplete,
  onMarkTodo,
  onEdit,
  onDelete,
}: {
  today: AppointmentSummary[]
  overdue: AppointmentSummary[]
  profiles: CareProfile[]
  onComplete: (appointment: AppointmentSummary) => void
  onMarkTodo: (appointment: AppointmentSummary) => void
  onEdit?: (appointment: AppointmentSummary) => void
  onDelete?: (appointment: AppointmentSummary) => void
}) {
  const count = today.filter((appointment) => appointment.status === 'scheduled').length
  const scope = JSON.stringify(profiles.map((profile) => [profile.circleId, profile.id]))
  return (
    <AttentionNeeded
      className="mt-4"
      scope={scope}
      items={[
        {
          id: 'overdue',
          label: overdue.length === 1 ? 'overdue appointment' : 'overdue appointments',
          count: overdue.length,
          title: 'Overdue appointments',
          tone: 'danger',
          content: (close) => renderItems(overdue, 'No overdue appointments.', close),
        },
        {
          id: 'today',
          label: count === 1 ? 'appointment today' : 'appointments today',
          count,
          title: 'Today’s appointments',
          tone: 'warning',
          ariaLabel: count
            ? `You have ${count} scheduled ${count === 1 ? 'appointment' : 'appointments'} today across all care profiles.`
            : 'No scheduled appointments today.',
          content: (close) => renderItems(today, 'No scheduled appointments today.', close),
        },
      ]}
    />
  )

  function renderItems(items: AppointmentSummary[], empty: string, close: () => void) {
    return !items.length ? (
      <p role="status" className="text-muted">
        {empty}
      </p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((appointment) => (
          <li key={appointmentKey(appointment)} className="py-4 first:pt-0 last:pb-0">
            <AppointmentListItem
              appointment={appointment}
              profileName={
                profiles.find(
                  (profile) => profile.id === appointment.recipientId && profile.circleId === appointment.circleId,
                )?.name ?? 'Care profile unavailable'
              }
              overdue={overdue.some((item) => appointmentKey(item) === appointmentKey(appointment))}
              onComplete={() => onComplete(appointment)}
              onMarkTodo={() => onMarkTodo(appointment)}
              onDelete={
                onDelete
                  ? () => {
                      close()
                      onDelete(appointment)
                    }
                  : undefined
              }
              onEdit={
                onEdit
                  ? () => {
                      close()
                      onEdit(appointment)
                    }
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    )
  }
}
