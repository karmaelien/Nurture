import type { CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useOverdueMedicationDoses } from '../care/queries.ts'
import { dashboardWindow } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'

export function PreviousOverdueDoses({ circle, recipientId }: { circle: CircleSummary; recipientId?: string }) {
  const { todayStart } = dashboardWindow(useMinute())
  const doses = useOverdueMedicationDoses(circle.id, todayStart, recipientId || undefined)
  if (doses.isPending || (!doses.isError && doses.data.length === 0)) return null
  return (
    <section
      aria-label="Overdue from previous days"
      className="mb-5 rounded-panel border border-danger/30 bg-danger/8 p-5 sm:p-6"
    >
      <h2 className="mb-2 font-display text-h3 font-semibold text-danger">Overdue from previous days</h2>
      {doses.isError ? (
        <Alert tone="danger">
          {errorMessage(doses.error)}{' '}
          <Button variant="secondary" onClick={() => void doses.refetch()}>
            Retry previous doses
          </Button>
        </Alert>
      ) : (
        <>
          <p className="mb-4 text-small text-muted">Times shown in your local time zone.</p>
          <MedicationDoseList
            circleId={circle.id}
            doses={doses.data}
            showDate
            personName={(id) =>
              circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'
            }
          />
        </>
      )}
    </section>
  )
}
