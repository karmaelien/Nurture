import type { CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { useMedicationOccurrences } from '../care/queries.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'
import { doseReminderWindow, isDoseReminderActive } from './medication-schedule.ts'

export function MedicationReminders({ circle, recipientId }: { circle: CircleSummary; recipientId?: string }) {
  const now = useMinute().getTime()
  const doses = useMedicationOccurrences(circle.id, {
    ...doseReminderWindow(now),
    status: 'pending',
    recipientId: recipientId || undefined,
  })
  const reminders = doses.data?.filter((dose) => isDoseReminderActive(dose, now)) ?? []
  if (doses.isPending || (!doses.isError && reminders.length === 0)) return null
  return (
    <section
      aria-label="Dose reminders"
      className="mb-5 rounded-panel border border-warning/30 bg-warning/8 p-5 sm:p-6"
    >
      <h2 className="font-display text-h3 font-semibold">Dose reminders</h2>
      {doses.isError ? (
        <Alert tone="danger">
          {errorMessage(doses.error)}{' '}
          <Button variant="secondary" onClick={() => void doses.refetch()}>
            Retry reminders
          </Button>
        </Alert>
      ) : (
        <>
          <p role="status" className="mt-2 mb-4 text-small text-muted">
            {reminders.length} {reminders.length === 1 ? 'dose needs' : 'doses need'} attention · Times shown in your
            local time zone.
          </p>
          <MedicationDoseList
            circleId={circle.id}
            doses={reminders}
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
