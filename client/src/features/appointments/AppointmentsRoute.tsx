import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import type { Appointment } from '../../api/types.ts'
import { FullPageError, FullPageSpinner } from '../../components/ui/FullPageStatus.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useAppointments } from '../care/queries.ts'
import { CircleSelection } from '../circles/CircleSelection.tsx'
import { useCircleSelection } from '../circles/selection.ts'
import { AppointmentEditor } from './AppointmentEditor.tsx'
import { AppointmentsPage } from './AppointmentsPage.tsx'
import { appointmentCalendarRange, toAppointmentSummary } from './appointment-record.ts'

export function AppointmentsRoute() {
  const { user, circles } = useRequiredSession()
  const { circle, selectCircle } = useCircleSelection(circles)
  const [editor, setEditor] = useState<{
    circleId: string
    appointment?: Appointment
    initialDate?: string
    recipientId?: string
    deleting?: boolean
  } | null>(null)
  const appointments = useAppointments(circle?.id ?? null, appointmentCalendarRange)
  const details = useQuery({
    queryKey: ['circle', user.id, circle?.id],
    queryFn: () => circlesApi.detail(circle!.id),
    enabled: !!circle,
    retry: false,
  })

  if (!circle) return <AppointmentsPage careProfiles={[]} appointments={[]} />
  if (appointments.isError) {
    return <FullPageError message={errorMessage(appointments.error)} onRetry={() => appointments.refetch()} />
  }
  if (appointments.isPending) return <FullPageSpinner />

  const profiles = circle.recipients.map((recipient) => ({
    id: recipient.id,
    name: recipient.name,
    circleId: circle.id,
    circleName: circle.name,
  }))
  const entries = appointments.data.map((appointment) =>
    toAppointmentSummary(
      appointment,
      circle.id,
      (id) =>
        details.data?.circle.members.find((member) => member.user.id === id)?.user.name ??
        (details.isPending ? 'Loading caregiver…' : 'Caregiver unavailable'),
    ),
  )
  const activeEditor = editor?.circleId === circle.id ? editor : null

  return (
    <>
      <AppointmentsPage
        key={circle.id}
        headerAside={<CircleSelection circles={circles} circle={circle} onChange={selectCircle} />}
        careProfiles={profiles}
        appointments={entries}
        onAdd={(initialDate, recipientId) => setEditor({ circleId: circle.id, initialDate, recipientId })}
        onDelete={(appointment) => {
          const record = appointments.data.find((item) => item.id === appointment.id)
          if (record) setEditor({ circleId: circle.id, appointment: record, deleting: true })
        }}
        onEdit={(appointment) => {
          const record = appointments.data.find((item) => item.id === appointment.id)
          if (record) setEditor({ circleId: circle.id, appointment: record })
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
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}
