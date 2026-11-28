import { Button } from '../../components/ui/Button.tsx'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import type { Appointment, CircleSummary, User } from '../../api/types.ts'
import { AppointmentEditor } from '../appointments/AppointmentEditor.tsx'
import { AppointmentListItem } from '../appointments/AppointmentListItem.tsx'
import { useAppointmentCompletion } from '../appointments/appointment-completion.ts'
import { compareAppointmentListOrder } from '../appointments/appointment-order.ts'
import { isAppointmentOverdue } from '../appointments/appointment-overdue.ts'
import { appointmentCalendarRange, toAppointmentSummary } from '../appointments/appointment-record.ts'
import { useAppointments } from '../care/queries.ts'
import { circleLink } from '../circles/selection.ts'
import { DashboardPanel } from './DashboardPanel.tsx'
import type { useHomeAppointments } from './useHomeAppointments.ts'

export function HomeAppointmentsPanel({
  appointments,
  circle,
  recipientId,
  caregivers,
  now,
  canAdd,
  onSaved,
}: {
  appointments: ReturnType<typeof useHomeAppointments>
  circle: CircleSummary
  recipientId?: string
  caregivers: User[]
  now: number
  canAdd: boolean
  onSaved: (action: 'saved' | 'deleted') => void
}) {
  const [editor, setEditor] = useState<{ appointment?: Appointment; deleting?: boolean } | null>(null)
  const history = useAppointments(
    circle.id,
    recipientId ? { ...appointmentCalendarRange, recipientId } : appointmentCalendarRange,
  )
  const { applyCompletion } = useAppointmentCompletion()
  const overdue = (history.data ?? [])
    .map((record) =>
      applyCompletion(
        toAppointmentSummary(
          record,
          circle.id,
          (id) => caregivers.find((person) => person.id === id)?.name ?? 'Caregiver unavailable',
        ),
      ),
    )
    .filter((appointment) => isAppointmentOverdue(appointment, now))
    .sort(compareAppointmentListOrder)

  function edit(record: Appointment | undefined) {
    if (record) setEditor({ appointment: record })
  }

  const overdueIds = new Set(overdue.map((appointment) => appointment.id))
  const entries = [...overdue, ...appointments.entries.filter((appointment) => !overdueIds.has(appointment.id))]

  return (
    <div className="min-w-0">
      <DashboardPanel
        id="appointments"
        to={circleLink('/app/appointments', circle.id)}
        title="Appointments"
        description="Overdue and upcoming visits · Next 7 days"
        action={
          <Button disabled={!canAdd || !circle.recipients.length} onClick={() => setEditor({})}>
            Add appointment
          </Button>
        }
        icon={<CalendarDays />}
        query={appointments.query}
        empty={!entries.length}
      >
        <ul
          className="max-h-[26rem] divide-y divide-line overflow-y-auto"
          aria-label={overdue.length ? 'Overdue and upcoming appointments' : 'Appointments in the next 7 days'}
          tabIndex={0}
        >
          {entries.map((appointment) => (
            <li key={appointment.id} className="py-4 first:pt-0 last:pb-0">
              <AppointmentListItem
                appointment={appointment}
                profileName={
                  circle.recipients.find((person) => person.id === appointment.recipientId)?.name ?? 'Care recipient'
                }
                overdue={overdueIds.has(appointment.id)}
                onComplete={() => appointments.markCompleted(appointment)}
                onMarkTodo={() => appointments.markTodo(appointment)}
                onDelete={() => {
                  const record = (overdueIds.has(appointment.id) ? history.data : appointments.query.data)?.find(
                    (item) => item.id === appointment.id,
                  )
                  if (record) setEditor({ appointment: record, deleting: true })
                }}
                onEdit={() =>
                  edit(
                    (overdueIds.has(appointment.id) ? history.data : appointments.query.data)?.find(
                      (record) => record.id === appointment.id,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
      </DashboardPanel>
      {editor && (
        <AppointmentEditor
          circleId={circle.id}
          appointment={editor.appointment}
          deleting={editor.deleting}
          initialRecipientId={recipientId}
          profiles={circle.recipients}
          caregivers={caregivers}
          onSaved={onSaved}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}
