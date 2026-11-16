import { useState } from 'react'
import type { AppointmentFilters, CircleSummary } from '../../api/types.ts'
import type { AppointmentDetailData } from '../appointments/AppointmentDetails.tsx'
import { compareAppointmentListOrder } from '../appointments/appointment-order.ts'
import { useAppointments } from '../care/queries.ts'

// Own the dashboard's appointment adaptation and temporary completion state in one place.
// CircleDashboard remounts on circle changes, while recipient filtering preserves completion edits.
export function useHomeAppointments(
  circle: CircleSummary,
  filters: AppointmentFilters,
  caregiverName: (id: string | null) => string,
) {
  const query = useAppointments(circle.id, filters)
  const [completionStatus, setCompletionStatus] = useState<Record<string, 'scheduled' | 'completed'>>({})
  // The dashboard response has no end time yet; preserve that rather than inventing a duration.
  const entries: (AppointmentDetailData & { profileName: string })[] = (query.data ?? [])
    .map((appointment) => ({
      id: appointment.id,
      circleId: circle.id,
      recipientId: appointment.recipientId,
      profileName: circle.recipients.find((person) => person.id === appointment.recipientId)?.name ?? 'Care recipient',
      title: appointment.title,
      startsAt: appointment.startsAt,
      location: appointment.location ?? undefined,
      status: completionStatus[appointment.id] ?? 'scheduled',
      assignedCaregiver: appointment.assignedCaregiverId
        ? { id: appointment.assignedCaregiverId, name: caregiverName(appointment.assignedCaregiverId) }
        : null,
    }))
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
    markCompleted: (id: string) => setCompletionStatus((current) => ({ ...current, [id]: 'completed' })),
    markTodo: (id: string) => setCompletionStatus((current) => ({ ...current, [id]: 'scheduled' })),
  }
}
