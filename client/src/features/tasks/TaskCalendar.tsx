import { useEffect, useId, useRef, useState } from 'react'
import type { CareTask, CircleSummary } from '../../api/types.ts'
import { errorMessage } from '../../api/client.ts'
import { Alert } from '../../components/ui/Alert.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { closeOnBackdropClick } from '../appointments/dialog.ts'
import type { useTasks } from '../care/queries.ts'
import { formatTime } from '../home/dashboard.ts'
import { TaskListItem } from './TaskListItem.tsx'
import { compareTasks } from './task-order.ts'

type View = 'daily' | 'weekly' | 'monthly'
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function TaskCalendar({
  circle,
  query,
  recipientId,
  status,
  now,
  caregiverName,
  onAdd,
  onEdit,
  onDelete,
}: {
  circle: CircleSummary
  query: ReturnType<typeof useTasks>
  recipientId: string
  status: CareTask['status'] | ''
  now: number
  caregiverName: (id: string | null) => string
  onAdd?: (date: string) => void
  onEdit?: (task: CareTask) => void
  onDelete: (task: CareTask) => void
}) {
  const [view, setView] = useState<View>('monthly')
  const [anchor, setAnchor] = useState(() => {
    const date = new Date(now)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  })
  const [preferredDay, setPreferredDay] = useState(anchor.getDate())
  const filterKey = JSON.stringify([recipientId, status])
  const [storedSelection, setSelection] = useState<{
    date: string
    taskId?: string
    hour?: number
    filterKey: string
    wholeDay?: boolean
  } | null>(null)
  const selection = storedSelection?.filterKey === filterKey ? storedSelection : null
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const start =
    view === 'monthly'
      ? new Date(year, month, 1)
      : view === 'weekly'
        ? new Date(year, month, anchor.getDate() - anchor.getDay())
        : anchor
  // Calendar boundaries use local dates, so DST days need not be exactly 24 hours long.
  const end =
    view === 'monthly'
      ? new Date(year, month + 1, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() + (view === 'weekly' ? 7 : 1))
  const byDay = new Map<string, CareTask[]>()
  for (const task of query.data ?? []) {
    if (!task.dueAt) continue // Undated tasks stay in the main list.
    const date = new Date(task.dueAt)
    if (!Number.isFinite(date.getTime()) || date < start || date >= end) continue
    const key = dateKey(date)
    const entries = byDay.get(key) ?? []
    entries.push(task)
    byDay.set(key, entries)
  }
  for (const entries of byDay.values())
    entries.sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!) || a.id.localeCompare(b.id))
  const selected = selection
    ? (byDay.get(selection.date) ?? [])
        .filter(
          (task) =>
            (!selection.taskId || task.id === selection.taskId) &&
            (selection.hour === undefined || new Date(task.dueAt!).getHours() === selection.hour),
        )
        .sort(compareTasks)
    : []
  const hasDetails = !!selection && !query.isError && !query.isPending && (selection.wholeDay || selected.length > 0)
  useEffect(() => {
    if (hasDetails && !dialog.current?.open) dialog.current?.showModal()
    else if (!hasDetails && dialog.current?.open) dialog.current.close()
  }, [hasDetails])
  const personName = (id: string) =>
    circle.recipients.find((person) => person.id === id)?.name ?? 'Care profile unavailable'
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
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (Date | null)[] =
    view === 'monthly'
      ? Array.from({ length: Math.ceil((start.getDay() + daysInMonth) / 7) * 7 }, (_, index) => {
          const day = index - start.getDay() + 1
          return day < 1 || day > daysInMonth ? null : new Date(year, month, day)
        })
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
    setSelection({ date: dateKey(date), filterKey, wholeDay: true })
  }
  function closeDetails() {
    dialog.current?.close()
    setSelection(null)
  }
  function events(date: Date, hour?: number) {
    const entries = (byDay.get(dateKey(date)) ?? []).filter(
      (task) => hour === undefined || new Date(task.dueAt!).getHours() === hour,
    )
    return (
      <>
        <ul className={hour === undefined ? 'mt-2 grid gap-1' : 'grid grid-flow-col auto-cols-fr gap-1'}>
          {entries.slice(0, 3).map((task) => {
            const overdue = task.status === 'pending' && Date.parse(task.dueAt!) < now
            const description = `${task.title} for ${personName(task.recipientId)}, ${formatTime(task.dueAt!)}, ${task.status === 'completed' ? 'Completed' : overdue ? 'Overdue' : 'To Do'}`
            return (
              <li key={task.id} className="min-w-0">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={description}
                  title={description}
                  className={`relative z-[1] h-8 w-full cursor-pointer truncate rounded-control bg-wash px-1.5 py-1 text-left text-small hover:bg-sage ${overdue ? 'border border-danger text-danger' : ''} ${task.status === 'completed' ? 'line-through' : ''}`}
                  onClick={() => setSelection({ date: dateKey(date), taskId: task.id, filterKey })}
                >
                  {formatTime(task.dueAt!)} · {task.title}
                </button>
              </li>
            )
          })}
        </ul>
        {entries.length > 3 && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Show all tasks${hour === undefined ? '' : ` at ${formatTime(new Date(2000, 0, 1, hour).toISOString())}`} on ${date.toLocaleDateString()}`}
            className="relative z-[1] mt-1 rounded-control px-1.5 text-small font-semibold hover:bg-wash"
            onClick={() => setSelection({ date: dateKey(date), hour, filterKey })}
          >
            {entries.length - 3} more
          </button>
        )}
      </>
    )
  }

  return (
    <section aria-label="Task Calendar" className="mt-6 min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-h2 font-bold">Calendar</h2>
      <p className="mt-2 text-muted">
        Due dates for the selected care profiles · Times shown in your local time zone. Undated tasks remain in the task
        list.
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Calendar view">
        {(['daily', 'weekly', 'monthly'] as const).map((option) => (
          <Button
            key={option}
            variant={view === option ? 'primary' : 'secondary'}
            aria-pressed={view === option}
            onClick={() => {
              setView(option)
              setSelection(null)
            }}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-h3 font-semibold" aria-live="polite">
          {label}
        </h3>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              const today = new Date(now)
              setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
              setPreferredDay(today.getDate())
              setSelection(null)
            }}
          >
            Today
          </Button>
          <Button variant="secondary" aria-label={`Previous ${unit}`} onClick={() => changePeriod(-1)}>
            Previous
          </Button>
          <Button variant="secondary" aria-label={`Next ${unit}`} onClick={() => changePeriod(1)}>
            Next
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <p role="status" className="mt-4">
          Loading calendar…
        </p>
      ) : query.isError ? (
        <div className="mt-4">
          <Alert tone="danger">
            {errorMessage(query.error)}{' '}
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Retry calendar
            </Button>
          </Alert>
        </div>
      ) : (
        <>
          <div
            className="mt-4 h-[38rem] overflow-auto rounded-panel border border-line"
            role="region"
            aria-label={`${label} task calendar`}
            tabIndex={0}
          >
            <table
              className={`w-full table-fixed border-collapse bg-surface ${view === 'daily' ? '' : 'min-w-[42rem]'}`}
            >
              <caption className="sr-only">{label} tasks</caption>
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
                          aria-label={`View tasks for ${days[index]!.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
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
                        {formatTime(new Date(2000, 0, 1, row).toISOString())}
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
                                aria-label={`View tasks for ${date.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                                className="cursor-pointer rounded-control after:absolute after:inset-0 hover:bg-wash focus-visible:outline-2 focus-visible:outline-primary"
                                onClick={() => openDay(date)}
                              >
                                <time
                                  dateTime={dateKey(date)}
                                  aria-current={dateKey(date) === dateKey(new Date(now)) ? 'date' : undefined}
                                  className={`inline-flex size-8 items-center justify-center rounded-control font-semibold ${dateKey(date) === dateKey(new Date(now)) ? 'bg-primary text-primary-foreground' : ''}`}
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
          {!byDay.size && <p className="mt-3 text-muted">No tasks due this {unit}.</p>}
        </>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClick={closeOnBackdropClick}
        onClose={() => setSelection(null)}
        className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/40"
      >
        <h2 id={heading} className="mb-4 font-display text-h2 font-bold">
          {selection?.taskId ? 'Task Details' : 'Tasks'}
        </h2>
        {selection && (
          <>
            <p className="mb-4 text-muted">
              {new Date(`${selection.date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'full' })} ·{' '}
              {recipientId ? personName(recipientId) : 'All care profiles'}
            </p>
            <Button
              className="mb-4"
              disabled={!onAdd}
              onClick={() => {
                const date = selection.date
                closeDetails()
                onAdd?.(date)
              }}
            >
              Add task
            </Button>
          </>
        )}
        {hasDetails && selected.length ? (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto pr-2">
            {selected.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                circleId={circle.id}
                person={personName(task.recipientId)}
                caregiver={caregiverName(task.assignedCaregiverId)}
                now={now}
                onEdit={
                  onEdit &&
                  (() => {
                    closeDetails()
                    onEdit(task)
                  })
                }
                onDelete={() => {
                  closeDetails()
                  onDelete(task)
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No tasks due for the selected filters on this date.</p>
        )}
        <Button variant="secondary" className="mt-6" onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </dialog>
    </section>
  )
}
