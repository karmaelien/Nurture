import { QueryFeedback } from '../../components/ui/QueryFeedback.tsx'
import { CalendarDetailsDialog } from '../../components/ui/CalendarDetailsDialog.tsx'
import { CalendarToolbar } from '../../components/ui/CalendarToolbar.tsx'
import { calendarBlockClasses } from '../../components/ui/statusStyles.ts'
import { useRef, useState } from 'react'
import type { CircleSummary, Medication, MedicationOccurrence } from '../../api/types.ts'
import { Button } from '../../components/ui/Button.tsx'
import { useMedicationOccurrences } from '../care/queries.ts'
import { formatTime } from '../home/dashboard.ts'
import { useMinute } from '../profiles/time.ts'
import { MedicationDoseList } from './MedicationDoseList.tsx'
import { isDoseOverdue } from './medication-schedule.ts'

type View = 'daily' | 'weekly' | 'monthly'
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function MedicationCalendar({
  circle,
  recipientId,
  medications,
  medicationId = '',
  onAdd,
  onEdit,
  onDelete,
}: {
  circle: CircleSummary
  recipientId: string
  medications: Medication[]
  medicationId?: string
  onAdd?: (date: string) => void
  onEdit?: (medication: Medication) => void
  onDelete?: (medication: Medication) => void
}) {
  const now = useMinute()
  const [view, setView] = useState<View>('monthly')
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const [preferredDay, setPreferredDay] = useState(anchor.getDate())
  const [storedSelection, setSelection] = useState<{
    date: string
    doseId?: string
    hour?: number
    wholeDay?: boolean
    recipientId: string
    medicationId: string
  } | null>(null)
  // A profile change hides the previous profile's dialog without resetting the viewed period.
  const selection =
    storedSelection?.recipientId === recipientId && storedSelection.medicationId === medicationId
      ? storedSelection
      : null
  const dialog = useRef<HTMLDialogElement>(null)
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const start =
    view === 'monthly'
      ? new Date(year, month, 1)
      : view === 'weekly'
        ? new Date(year, month, anchor.getDate() - anchor.getDay())
        : anchor
  // Local calendar boundaries, rather than fixed 24-hour additions, preserve DST dates.
  const end =
    view === 'monthly'
      ? new Date(year, month + 1, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + (view === 'weekly' ? 7 : 1))
  const doses = useMedicationOccurrences(circle.id, {
    from: start.toISOString(),
    to: end.toISOString(),
    recipientId: recipientId || undefined,
  })
  const personName = (id: string) =>
    circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'
  const byDay = new Map<string, MedicationOccurrence[]>()
  for (const dose of doses.data ?? []) {
    if (medicationId && dose.medicationId !== medicationId) continue
    const key = dateKey(new Date(dose.scheduledAt))
    const entries = byDay.get(key) ?? []
    entries.push(dose)
    byDay.set(key, entries)
  }
  for (const entries of byDay.values())
    entries.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id.localeCompare(b.id))
  const selected = selection
    ? (byDay.get(selection.date) ?? []).filter(
        (dose) =>
          (!selection.doseId || dose.id === selection.doseId) &&
          (selection.hour === undefined || new Date(dose.scheduledAt).getHours() === selection.hour),
      )
    : []
  const hasDetails = !!selection && (selection.wholeDay || selected.length > 0) && !doses.isError && !doses.isPending

  const unit = view === 'monthly' ? 'month' : view === 'weekly' ? 'week' : 'day'
  const label =
    view === 'monthly'
      ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : view === 'daily'
        ? anchor.toLocaleDateString(undefined, { dateStyle: 'full' })
        : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(
            start,
            new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6),
          )
  const days: (Date | null)[] =
    view === 'monthly'
      ? Array.from(
          { length: Math.ceil((start.getDay() + new Date(year, month + 1, 0).getDate()) / 7) * 7 },
          (_, index) => {
            const day = index - start.getDay() + 1
            return day < 1 || day > new Date(year, month + 1, 0).getDate() ? null : new Date(year, month, day)
          },
        )
      : Array.from(
          { length: view === 'weekly' ? 7 : 1 },
          (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index),
        )

  function changePeriod(offset: number) {
    setSelection(null)
    if (view === 'monthly')
      setAnchor(new Date(year, month + offset, Math.min(preferredDay, new Date(year, month + offset + 1, 0).getDate())))
    else {
      const next = new Date(year, month, anchor.getDate() + offset * (view === 'weekly' ? 7 : 1))
      setAnchor(next)
      setPreferredDay(next.getDate())
    }
  }
  function openDay(date: Date) {
    setSelection({ date: dateKey(date), recipientId, medicationId, wholeDay: true })
  }
  function closeForEditor() {
    dialog.current?.close()
    setSelection(null)
  }
  function events(date: Date, hour?: number) {
    const entries = (byDay.get(dateKey(date)) ?? []).filter(
      (dose) => hour === undefined || new Date(dose.scheduledAt).getHours() === hour,
    )
    return (
      <>
        <ul className={hour === undefined ? 'mt-2 grid gap-1' : 'grid grid-flow-col auto-cols-fr gap-1'}>
          {entries.slice(0, 3).map((dose) => {
            const missed = isDoseOverdue(dose, now.getTime())
            const status = dose.status === 'completed' ? 'Taken' : missed ? 'Missed' : 'Pending'
            return (
              <li key={dose.id} className="min-w-0">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${dose.name} for ${personName(dose.recipientId)}, ${formatTime(dose.scheduledAt)}, ${status}`}
                  title={`${dose.name} · ${personName(dose.recipientId)} · ${formatTime(dose.scheduledAt)} · ${status}`}
                  className={`relative z-[1] h-8 truncate ${calendarBlockClasses(missed, dose.status === 'completed')}`}
                  onClick={() => setSelection({ date: dateKey(date), doseId: dose.id, recipientId, medicationId })}
                >
                  {formatTime(dose.scheduledAt)} · {dose.name}
                </button>
              </li>
            )
          })}
        </ul>
        {entries.length > 3 && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Show all doses${hour === undefined ? '' : ` at ${new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`} on ${date.toLocaleDateString()}`}
            className="relative z-[1] mt-1 rounded-control px-1.5 text-small font-semibold hover:bg-wash"
            onClick={() => setSelection({ date: dateKey(date), hour, recipientId, medicationId })}
          >
            {entries.length - 3} more
          </button>
        )}
      </>
    )
  }

  return (
    <section
      aria-label="Medication Calendar"
      className="mt-6 min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="font-display text-h2 font-bold">Calendar</h2>
      <p className="mt-2 text-muted">Doses for the selected care profiles · Times shown in your local time zone.</p>
      <CalendarToolbar
        view={view}
        anchor={anchor}
        label={label}
        now={now.getTime()}
        onView={(value) => {
          setView(value)
          setSelection(null)
        }}
        onDate={(date) => {
          setAnchor(date)
          setPreferredDay(date.getDate())
          setSelection(null)
        }}
        onPeriod={changePeriod}
      />
      {doses.isPending || doses.isError ? (
        <QueryFeedback query={doses} loading="Loading calendar…" />
      ) : (
        <>
          <div
            className="mt-4 h-[38rem] overflow-auto rounded-panel border border-line"
            role="region"
            aria-label={`${label} medication calendar`}
            tabIndex={0}
          >
            <table
              className={`w-full table-fixed border-collapse bg-surface ${view === 'daily' ? '' : 'min-w-[42rem]'}`}
            >
              <caption className="sr-only">{label} medication doses</caption>
              <thead className="sticky top-0 z-10">
                <tr>
                  {view !== 'monthly' && (
                    <th scope="col" className="w-24 border-b border-line bg-wash p-3 text-left">
                      Time
                    </th>
                  )}
                  {(view === 'monthly'
                    ? weekdays
                    : days.map((date) =>
                        date!.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                      )
                  ).map((day, index) => (
                    <th key={day} scope="col" className="border-b border-line bg-wash p-3 text-left font-semibold">
                      {view === 'monthly' ? (
                        <abbr title={day} className="no-underline">
                          {day.slice(0, 3)}
                        </abbr>
                      ) : (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={`View medications for ${days[index]!.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                          className="w-full cursor-pointer rounded-control text-left hover:underline"
                          onClick={() => openDay(days[index]!)}
                        >
                          {day}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: view === 'monthly' ? days.length / 7 : 24 }, (_, row) => (
                  <tr key={row}>
                    {view !== 'monthly' && (
                      <th scope="row" className="border border-line p-2 text-left align-top font-normal text-muted">
                        {new Date(2000, 0, 1, row).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </th>
                    )}
                    {(view === 'monthly' ? days.slice(row * 7, row * 7 + 7) : days).map((date, index) => (
                      <td
                        key={index}
                        className={`relative ${view === 'monthly' ? 'h-48' : 'h-20'} border border-line p-2 align-top ${date ? '' : 'bg-wash/40'}`}
                      >
                        {date && (
                          <>
                            {view === 'monthly' && (
                              <button
                                type="button"
                                aria-haspopup="dialog"
                                aria-label={`View medications for ${date.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                                className="cursor-pointer rounded-control after:absolute after:inset-0 hover:bg-wash focus-visible:outline-2 focus-visible:outline-primary"
                                onClick={() => openDay(date)}
                              >
                                <time
                                  dateTime={dateKey(date)}
                                  aria-current={dateKey(date) === dateKey(now) ? 'date' : undefined}
                                  className={`inline-flex size-8 items-center justify-center rounded-control font-semibold ${dateKey(date) === dateKey(now) ? 'bg-primary text-primary-foreground' : ''}`}
                                >
                                  {date.getDate()}
                                </time>
                              </button>
                            )}
                            {events(date, view === 'monthly' ? undefined : row)}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!doses.data?.length && <p className="mt-3 text-muted">No doses scheduled this {unit}.</p>}
        </>
      )}
      <CalendarDetailsDialog
        open={!!hasDetails}
        dialogRef={dialog}
        title={selection?.wholeDay ? 'Medications' : selection?.doseId ? 'Dose Details' : 'Scheduled Doses'}
        date={selection ? new Date(`${selection.date}T00:00:00`) : undefined}
        scope={recipientId ? personName(recipientId) : 'All care profiles'}
        action={
          selection && onAdd ? (
            <Button
              onClick={() => {
                const date = selection.date
                closeForEditor()
                onAdd(date)
              }}
            >
              Add medication
            </Button>
          ) : undefined
        }
        onClose={() => setSelection(null)}
      >
        {onEdit &&
          selected.some((dose) =>
            medications.some((medication) => medication.id === dose.medicationId && !medication.stoppedAt),
          ) && (
            <p className="mb-4 text-small text-muted">Editing changes the medication schedule, not just this date.</p>
          )}
        {hasDetails && selected.length > 0 ? (
          <MedicationDoseList
            circleId={circle.id}
            doses={selected}
            scrollable={false}
            personName={personName}
            showDate
            editableMedicationIds={medications
              .filter((medication) => !medication.stoppedAt)
              .map((medication) => medication.id)}
            deletableMedicationIds={medications.map((medication) => medication.id)}
            onDelete={
              onDelete
                ? (id) => {
                    const medication = medications.find((item) => item.id === id)
                    if (!medication) return
                    closeForEditor()
                    onDelete(medication)
                  }
                : undefined
            }
            onEdit={
              onEdit &&
              ((id) => {
                const medication = medications.find((item) => item.id === id && !item.stoppedAt)
                if (!medication) return
                closeForEditor()
                onEdit(medication)
              })
            }
          />
        ) : (
          <p className="text-muted">
            {selection?.wholeDay ? 'No medications scheduled for this date.' : 'No doses available for this selection.'}
          </p>
        )}
      </CalendarDetailsDialog>
    </section>
  )
}
