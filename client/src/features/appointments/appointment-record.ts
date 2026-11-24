import type { Appointment } from '../../api/types.ts'
import type { AppointmentSummary } from './AppointmentsPage.tsx'

// The preview API has no pagination and requires both bounds.
export const appointmentCalendarRange = { from: '0001-01-01T00:00:00.000Z', to: '9999-12-31T23:59:59.999Z' }

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
