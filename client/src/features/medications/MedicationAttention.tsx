import type { CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useMedicationOccurrences, useOverdueMedicationDoses } from '../care/queries.ts'
import { dashboardWindow } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'
import { OverdueDoseControls } from './OverdueDoseControls.tsx'
import { doseReminderWindow, isDoseReminderActive } from './medication-schedule.ts'

export function MedicationAttention({ circle, recipientId }: { circle: CircleSummary; recipientId: string }) {
  const now = useMinute()
  const overdue = useOverdueMedicationDoses(circle.id, dashboardWindow(now).tomorrowStart, recipientId || undefined)
  const reminders = useMedicationOccurrences(circle.id, {
    ...doseReminderWindow(now.getTime()),
    status: 'pending',
    recipientId: recipientId || undefined,
  })
  // Reminder and overdue windows do not overlap. Keep all overdue doses first.
  const doses = [
    ...(overdue.data ?? []),
    ...(reminders.data?.filter((dose) => isDoseReminderActive(dose, now.getTime())) ?? []),
  ]
  if (!doses.length && !overdue.historyPending && !overdue.isError && !reminders.isError) return null
  return (
    <section aria-label="Attention needed" className="mb-6 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-h3 font-semibold">Attention needed</h2>
      <p className="mt-2 mb-4 text-small text-muted">
        Overdue doses first, then dose reminders · Times shown in your local time zone.
      </p>
      {[overdue, reminders].map(
        (query, index) =>
          query.isError && (
            <div key={index} className="mb-4">
              <Alert tone="danger">
                {errorMessage(query.error)}{' '}
                <Button variant="secondary" onClick={() => void query.refetch()}>
                  {index === 0 ? 'Retry overdue doses' : 'Retry reminders'}
                </Button>
              </Alert>
            </div>
          ),
      )}
      {doses.length > 0 && (
        <MedicationDoseList
          circleId={circle.id}
          doses={doses}
          totalOverdueCount={overdue.totalOverdueCount}
          overdueCountIsPartial={overdue.historyPending}
          showDate
          personName={(id) => circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'}
        />
      )}
      <OverdueDoseControls
        historyPending={overdue.historyPending}
        hasNextPage={overdue.hasNextPage}
        busy={overdue.isFetchingNextPage}
        onMore={() => void overdue.fetchNextPage()}
      />
    </section>
  )
}
