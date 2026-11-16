import type { AppointmentFilters, CircleSummary } from '../../api/types.ts'
import type { AppointmentSummary } from '../appointments/AppointmentsPage.tsx'
import { useAppointmentCompletion } from '../appointments/appointment-completion.ts'
import { compareAppointmentListOrder } from '../appointments/appointment-order.ts'
import { toAppointmentSummary } from '../appointments/appointment-record.ts'
import { useAppointments } from '../care/queries.ts'

export function useHomeAppointments(
  circle: CircleSummary,
  filters: AppointmentFilters,
  caregiverName: (id: string | null) => string,
) {
  const query = useAppointments(circle.id, filters)
  const { applyCompletion, setCompletion } = useAppointmentCompletion()
  const entries = (query.data ?? [])
    .map((appointment) => applyCompletion(toAppointmentSummary(appointment, circle.id, caregiverName)))
    .sort(compareAppointmentListOrder)

  const upcomingCountLabel = query.isError
    ? 'Unavailable'
    : query.isPending
      ? '…'
      : String(entries.filter((appointment) => appointment.status === 'scheduled').length)

  return {
    query,
    entries,
    upcomingCountLabel,
    markCompleted: (appointment: AppointmentSummary) => setCompletion(appointment, 'completed'),
    markTodo: (appointment: AppointmentSummary) => setCompletion(appointment, 'scheduled'),
  }
}
