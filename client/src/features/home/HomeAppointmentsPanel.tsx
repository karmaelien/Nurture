import { CalendarDays } from 'lucide-react'
import { AppointmentListItem } from '../appointments/AppointmentListItem.tsx'
import { DashboardPanel } from './DashboardPanel.tsx'
import type { useHomeAppointments } from './useHomeAppointments.ts'

export function HomeAppointmentsPanel({ appointments }: { appointments: ReturnType<typeof useHomeAppointments> }) {
  return (
    <DashboardPanel
      id="appointments"
      to="/app/appointments"
      title="Appointments · next 7 days"
      icon={<CalendarDays />}
      query={appointments.query}
      empty={!appointments.entries.length}
    >
      <ul
        className="max-h-[26rem] divide-y divide-line overflow-y-auto"
        aria-label="Appointments in the next 7 days"
        tabIndex={0}
      >
        {appointments.entries.map((appointment) => (
          <li key={appointment.id} className="py-4 first:pt-0 last:pb-0">
            <AppointmentListItem
              appointment={appointment}
              profileName={appointment.profileName}
              onComplete={() => appointments.markCompleted(appointment.id)}
              onMarkTodo={() => appointments.markTodo(appointment.id)}
            />
          </li>
        ))}
      </ul>
    </DashboardPanel>
  )
}
