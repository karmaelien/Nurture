import type { CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useMedicationOccurrences } from '../care/queries.ts'
import { dashboardWindow } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'

export function TodayMedicationDoses({ circle, recipientId }: { circle: CircleSummary; recipientId: string }) {
  const dates = dashboardWindow(useMinute())
  const doses = useMedicationOccurrences(circle.id, {
    from: dates.todayStart,
    to: dates.tomorrowStart,
    recipientId: recipientId || undefined,
  })
  return (
    <section aria-label="Today’s doses" className="mb-6 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-h3 font-semibold">Today’s doses</h2>
        {doses.data && (
          <p className="text-small text-muted">
            {doses.data.filter((dose) => dose.status === 'completed').length} / {doses.data.length} taken
          </p>
        )}
      </div>
      <p className="mb-4 text-small text-muted">Times shown in your local time zone.</p>
      {doses.isPending ? (
        <p role="status">Loading doses…</p>
      ) : doses.isError ? (
        <Alert tone="danger">
          {errorMessage(doses.error)}{' '}
          <Button variant="secondary" onClick={() => void doses.refetch()}>
            Retry doses
          </Button>
        </Alert>
      ) : doses.data.length === 0 ? (
        <p className="text-muted">No doses scheduled today for {recipientId ? 'this care profile' : 'this family'}.</p>
      ) : (
        <MedicationDoseList
          circleId={circle.id}
          doses={doses.data}
          personName={(id) => circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'}
        />
      )}
    </section>
  )
}
