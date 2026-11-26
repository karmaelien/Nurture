import type { CircleSummary } from '../../api/types.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
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
  const accessLost = [overdue.error, reminders.error].some(
    (error) => error instanceof ApiError && [401, 403, 404].includes(error.status),
  )
  // Do not reuse cached health data after an access failure from either request.
  const doses = accessLost
    ? []
    : [
        ...(overdue.isError ? [] : (overdue.data ?? [])),
        ...(reminders.isError
          ? []
          : (reminders.data?.filter((dose) => isDoseReminderActive(dose, now.getTime())) ?? [])),
      ]
  if (!doses.length && !overdue.historyPending && !overdue.isError && !reminders.isError) return null
  return (
    <section aria-label="Attention Needed" className="mb-4 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-h3 font-semibold">Attention Needed</h2>
      <div className="mt-3 max-h-64 overflow-y-auto pr-2">
        <p className="mb-3 text-small text-muted">
          Missed doses first, then dose reminders · Times shown in your local time zone.
        </p>
        {[overdue, reminders].map(
          (query, index) =>
            query.isError && (
              <div key={index} className="mb-4">
                <Alert tone="danger">
                  {errorMessage(query.error)}{' '}
                  <Button variant="secondary" onClick={() => void query.refetch()}>
                    {index === 0 ? 'Retry missed doses' : 'Retry reminders'}
                  </Button>
                </Alert>
              </div>
            ),
        )}
        {doses.length > 0 && (
          <MedicationDoseList
            circleId={circle.id}
            doses={doses}
            totalOverdueCount={overdue.isError ? undefined : overdue.totalOverdueCount}
            overdueCountIsPartial={!overdue.isError && overdue.historyPending}
            showDate
            scrollable={false}
            personName={(id) =>
              circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'
            }
          />
        )}
        {!overdue.isError && !accessLost && (
          <OverdueDoseControls
            historyPending={overdue.historyPending}
            hasNextPage={overdue.hasNextPage}
            busy={overdue.isFetchingNextPage}
            onMore={() => void overdue.fetchNextPage()}
          />
        )}
      </div>
    </section>
  )
}
