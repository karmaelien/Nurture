import { useCareSelection } from '../care/selection.ts'
import type { CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { TextField } from '../../components/ui/Field.tsx'
import { useMedicationOccurrences } from '../care/queries.ts'
import { dashboardWindow } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'

const localDate = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

function DosesForDate({
  circle,
  recipientId,
  date,
  scrollable,
}: {
  circle: CircleSummary
  recipientId: string
  date: string
  scrollable: boolean
}) {
  // Local midnights keep the selected calendar date correct across time zones and DST.
  const { todayStart, tomorrowStart } = dashboardWindow(new Date(`${date}T00:00:00`))
  const doses = useMedicationOccurrences(circle.id, {
    from: todayStart,
    to: tomorrowStart,
    recipientId: recipientId || undefined,
  })
  if (doses.isPending) return <p role="status">Loading doses…</p>
  if (doses.isError)
    return (
      <Alert tone="danger">
        {errorMessage(doses.error)}{' '}
        <Button variant="secondary" onClick={() => void doses.refetch()}>
          Retry doses
        </Button>
      </Alert>
    )
  if (!doses.data.length)
    return (
      <p className="text-muted">
        No doses scheduled on this date for {recipientId ? 'this care profile' : 'this family'}.
      </p>
    )
  return (
    <>
      <p className="mb-4 text-small text-muted">
        {doses.data.filter((dose) => dose.status === 'completed').length} / {doses.data.length} taken
      </p>
      <MedicationDoseList
        circleId={circle.id}
        doses={doses.data}
        showDate
        scrollable={scrollable}
        personName={(id) => circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'}
      />
    </>
  )
}

export function MedicationDoses({
  circle,
  recipientId,
  fillColumn = false,
}: {
  circle: CircleSummary
  recipientId: string
  fillColumn?: boolean
}) {
  const today = localDate(useMinute())
  // A null selection follows today across midnight; explicitly chosen history stays on its date.
  const { selectedDate, setSelectedDate } = useCareSelection(circle)
  const date = selectedDate ?? today
  const parsedDate = new Date(`${date}T00:00:00`)
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime()) && localDate(parsedDate) === date
  return (
    <section
      aria-label="Medication Schedule"
      className={`min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6 ${fillColumn ? 'flex flex-col lg:h-[38rem]' : 'mb-4'}`}
    >
      <div className="shrink-0">
        <h2 className="font-display text-h3 font-semibold">Medication Schedule</h2>
        <p className="mt-2 mb-4 text-small text-muted">
          Doses for the selected care profiles · Times shown in your local time zone.
        </p>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="w-full max-w-sm lg:w-auto lg:min-w-0 lg:basis-48 lg:flex-1">
            <TextField
              label="Dose date"
              type="date"
              value={date}
              onChange={(event) => setSelectedDate(event.target.value)}
              error={date && !valid ? 'Choose a valid date.' : undefined}
            />
          </div>
          <Button variant="secondary" onClick={() => setSelectedDate(null)}>
            Today
          </Button>
        </div>
      </div>
      <div className={fillColumn ? 'min-h-0 max-h-64 flex-1 overflow-y-auto pr-2 lg:max-h-none' : ''}>
        {valid ? (
          <DosesForDate circle={circle} recipientId={recipientId} date={date} scrollable={!fillColumn} />
        ) : (
          <p className="text-muted">Choose a date to view doses.</p>
        )}
      </div>
    </section>
  )
}
