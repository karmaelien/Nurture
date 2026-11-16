import type { AppointmentSummary } from './AppointmentsPage.tsx'

// Full lists have room for a status label; compact calendar blocks use strikethrough instead.
export function AppointmentStatus({ status }: { status: AppointmentSummary['status'] }) {
  return (
    <span className="mt-2 inline-block rounded-control border border-line px-2 py-1">
      {status === 'completed' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
    </span>
  )
}
