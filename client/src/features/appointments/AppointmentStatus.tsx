import type { AppointmentSummary } from './AppointmentsPage.tsx'

import { StatusBadge } from '../../components/ui/StatusBadge.tsx'

// Full lists have room for a status label; compact calendar blocks use strikethrough instead.
export function AppointmentStatus({ status }: { status: AppointmentSummary['status'] }) {
  return (
    <span className="mt-2 inline-block">
      <StatusBadge tone={status === 'completed' ? 'positive' : 'neutral'}>
        {status === 'completed' ? 'Completed' : status === 'cancelled' ? 'Cancelled' : 'Scheduled'}
      </StatusBadge>
    </span>
  )
}
