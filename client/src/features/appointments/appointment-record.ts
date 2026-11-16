import type { Appointment } from '../../api/types.ts'
import type { AppointmentSummary } from './AppointmentsPage.tsx'

export function toAppointmentSummary(
  appointment: Appointment,
  circleId: string,
  caregiverName: (id: string) => string,
): AppointmentSummary {
  const caregiverId = appointment.assignedCaregiverId
  return {
    id: appointment.id,
    circleId,
    recipientId: appointment.recipientId,
    title: appointment.title,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    location: appointment.location ?? undefined,
    status: appointment.status ?? 'scheduled',
    assignedCaregiver: caregiverId ? { id: caregiverId, name: caregiverName(caregiverId) } : null,
  }
}
