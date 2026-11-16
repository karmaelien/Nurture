import { useQuery } from '@tanstack/react-query'
import { circlesApi } from '../../api/circles.ts'
import { errorMessage } from '../../api/client.ts'
import { FullPageError, FullPageSpinner } from '../../components/ui/FullPageStatus.tsx'
import { useRequiredSession } from '../auth/session.ts'
import { useAppointments } from '../care/queries.ts'
import { useCircleSelection } from '../circles/selection.ts'
import { AppointmentsPage } from './AppointmentsPage.tsx'
import { toAppointmentSummary } from './appointment-record.ts'

// The preview endpoint is unpaginated. Load the circle's records once so calendar navigation works in both directions.
const calendarRange = { from: '0001-01-01T00:00:00.000Z', to: '9999-12-31T23:59:59.999Z' }

export function AppointmentsRoute() {
  const { user, circles } = useRequiredSession()
  const { circle } = useCircleSelection(circles)
  const appointments = useAppointments(circle?.id ?? null, calendarRange)
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
  return <AppointmentsPage key={circle.id} careProfiles={profiles} appointments={entries} />
}
