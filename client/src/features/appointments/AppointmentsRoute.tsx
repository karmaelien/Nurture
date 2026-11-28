import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { useCareSelection } from '../care/selection.ts'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { circlesApi } from '../../api/circles.ts'
import type { Appointment, CircleSummary } from '../../api/types.ts'
import { useRequiredSession } from '../auth/session.ts'
import { useAppointments } from '../care/queries.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { AppointmentEditor } from './AppointmentEditor.tsx'
import { AppointmentsPage } from './AppointmentsPage.tsx'
import { appointmentCalendarRange, toAppointmentSummary } from './appointment-record.ts'

export function AppointmentsRoute() {
  const { circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  const headerAside = <CircleSelection circles={circles} circle={circle} onChange={selectCircle} />
  return circle ? (
    <CircleAppointments key={circle.id} circle={circle} headerAside={headerAside} />
  ) : (
    <AppointmentsPage headerAside={headerAside} careProfiles={[]} appointments={[]} />
  )
}

/** Family changes discard editors and notices, as on the other collection pages. */
function CircleAppointments({ circle, headerAside }: { circle: CircleSummary; headerAside: ReactNode }) {
  const { user } = useRequiredSession()
  const [editor, setEditor] = useState<{
    appointment?: Appointment
    initialDate?: string
    recipientId?: string
    deleting?: boolean
  } | null>(null)
  const { recipientId, setRecipientId, resetFilters } = useCareSelection(circle)
  const [notice, setNotice] = useState('')
  const appointments = useAppointments(circle.id, appointmentCalendarRange)
  const details = useQuery({
    queryKey: ['circle', user.id, circle.id],
    queryFn: () => circlesApi.detail(circle.id),
    retry: false,
  })

  const profiles = circle.recipients.map((recipient) => ({
    id: recipient.id,
    name: recipient.name,
    circleId: circle.id,
    circleName: circle.name,
  }))
  const entries = (appointments.data ?? []).map((appointment) =>
    toAppointmentSummary(
      appointment,
      circle.id,
      (id) =>
        details.data?.circle.members.find((member) => member.user.id === id)?.user.name ??
        (details.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'),
    ),
  )
  const activeEditor = editor

  return (
    <>
      <AppointmentsPage
        headerAside={headerAside}
        recipientId={recipientId}
        onRecipientChange={setRecipientId}
        onClear={resetFilters}
        notice={notice}
        query={appointments}
        caregiverError={
          details.isError ? <QueryFeedback query={details} message="Caregiver names could not load." /> : undefined
        }
        careProfiles={profiles}
        appointments={entries}
        onAdd={(initialDate, recipientId) => setEditor({ initialDate, recipientId })}
        onDelete={(appointment) => {
          const record = appointments.data?.find((item) => item.id === appointment.id)
          if (record) setEditor({ appointment: record, deleting: true })
        }}
        onEdit={(appointment) => {
          const record = appointments.data?.find((item) => item.id === appointment.id)
          if (record) setEditor({ appointment: record })
        }}
      />
      {activeEditor && (
        <AppointmentEditor
          key={JSON.stringify([circle.id, activeEditor.appointment?.id])}
          circleId={circle.id}
          appointment={activeEditor.appointment}
          initialDate={activeEditor.initialDate}
          initialRecipientId={activeEditor.recipientId}
          deleting={activeEditor.deleting}
          profiles={profiles}
          caregivers={details.data?.circle.members.map((member) => member.user) ?? []}
          onSaved={(action) =>
            setNotice(
              action === 'deleted' ? 'Appointment deleted.' : 'Appointment saved. Clear filters if it is not shown.',
            )
          }
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}
