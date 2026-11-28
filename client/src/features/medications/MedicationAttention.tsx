import type { CircleSummary } from '../../api/types.ts'
import { ApiError, errorMessage } from '../../api/client.ts'
import { useMedicationOccurrences, useOverdueMedicationDoses } from '../care/queries.ts'
import { dashboardWindow } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'
import { OverdueDoseControls } from './OverdueDoseControls.tsx'
import { doseReminderWindow, isDoseReminderActive } from './medication-schedule.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { AttentionNeeded } from '../../components/ui/AttentionNeeded.tsx'

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
  const missed = overdue.isError || accessLost ? [] : (overdue.data ?? [])
  const upcoming =
    reminders.isError || accessLost
      ? []
      : (reminders.data?.filter((dose) => isDoseReminderActive(dose, now.getTime())) ?? [])
  const missedCount = overdue.totalOverdueCount ?? missed.length
  return (
    <AttentionNeeded
      scope={JSON.stringify([circle.id, recipientId])}
      className="mb-4"
      items={
        accessLost
          ? []
          : [
              {
                id: 'missed',
                label: missedCount === 1 ? 'missed dose' : 'missed doses',
                count: missedCount,
                title: 'Missed doses',
                tone: 'danger',
                partial: overdue.historyPending,
                loading: overdue.isPending,
                error: accessLost
                  ? 'Medication access unavailable.'
                  : overdue.isError
                    ? errorMessage(overdue.error)
                    : undefined,
                retry: () => void overdue.refetch(),
                retryLabel: 'Retry missed doses',
                content: () => (
                  <>
                    {renderDoses(missed)}
                    <OverdueDoseControls
                      historyPending={overdue.historyPending}
                      hasNextPage={overdue.hasNextPage}
                      busy={overdue.isFetchingNextPage}
                      onMore={() => void overdue.fetchNextPage()}
                    />
                  </>
                ),
              },
              {
                id: 'reminders',
                label: 'dose reminders',
                count: upcoming.length,
                title: 'Dose reminders',
                tone: 'warning',
                loading: reminders.isPending,
                error: accessLost
                  ? 'Medication access unavailable.'
                  : reminders.isError
                    ? errorMessage(reminders.error)
                    : undefined,
                retry: () => void reminders.refetch(),
                retryLabel: 'Retry reminders',
                content: () => renderDoses(upcoming),
              },
            ]
      }
    >
      {accessLost && (
        <Alert tone="danger">
          Medication access unavailable.{' '}
          <Button
            variant="secondary"
            onClick={() => {
              void overdue.refetch()
              void reminders.refetch()
            }}
          >
            Retry medication attention
          </Button>
        </Alert>
      )}
    </AttentionNeeded>
  )

  function renderDoses(items: typeof doses) {
    return items.length ? (
      <MedicationDoseList
        circleId={circle.id}
        doses={items}
        showDate
        scrollable={false}
        totalOverdueCount={items === missed ? overdue.totalOverdueCount : undefined}
        overdueCountIsPartial={items === missed && overdue.historyPending}
        personName={(id) => circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'}
      />
    ) : (
      <p className="text-muted">No doses need attention in this category.</p>
    )
  }
}
