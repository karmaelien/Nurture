import type { AppointmentSummary } from './AppointmentsPage.tsx'
import { hasValidAppointmentTime } from './calendar-layout.ts'

export function isAppointmentOverdue(appointment: AppointmentSummary, now: number) {
  // Older start-only records cannot establish when a visit ended.
  return (
    appointment.status === 'scheduled' &&
    !!appointment.endsAt &&
    hasValidAppointmentTime(appointment) &&
    Date.parse(appointment.endsAt) <= now
  )
}
