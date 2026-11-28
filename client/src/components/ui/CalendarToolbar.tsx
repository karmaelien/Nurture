import { Button } from './Button.tsx'
import { TextField } from './Field.tsx'

export type CalendarView = 'daily' | 'weekly' | 'monthly'
const calendarDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Shared navigation keeps all care calendars on the same controls and date behavior. */
export function CalendarToolbar({
  view,
  onView,
  anchor,
  label,
  now,
  onDate,
  onPeriod,
}: {
  view: CalendarView
  onView: (view: CalendarView) => void
  anchor: Date
  label: string
  now: number
  onDate: (date: Date) => void
  onPeriod: (offset: number) => void
}) {
  const unit = view === 'monthly' ? 'month' : view === 'weekly' ? 'week' : 'day'
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Calendar view">
        {(['daily', 'weekly', 'monthly'] as const).map((option) => (
          <Button
            key={option}
            variant={view === option ? 'primary' : 'secondary'}
            aria-pressed={view === option}
            onClick={() => onView(option)}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-display text-h3 font-semibold" aria-live="polite">
          {label}
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label="Calendar date"
            type="date"
            value={calendarDateKey(anchor)}
            onChange={(event) => {
              const value = event.target.value
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return
              const date = new Date(`${value}T00:00:00`)
              if (Number.isFinite(date.getTime()) && calendarDateKey(date) === value) onDate(date)
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              const today = new Date(now)
              onDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
            }}
          >
            Today
          </Button>
          <Button variant="secondary" aria-label={`Previous ${unit}`} onClick={() => onPeriod(-1)}>
            Previous
          </Button>
          <Button variant="secondary" aria-label={`Next ${unit}`} onClick={() => onPeriod(1)}>
            Next
          </Button>
        </div>
      </div>
    </>
  )
}
