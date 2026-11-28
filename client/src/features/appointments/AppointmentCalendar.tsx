import { CalendarDetailsDialog } from '../../components/ui/CalendarDetailsDialog.tsx'
import { CalendarToolbar } from '../../components/ui/CalendarToolbar.tsx'
import { calendarBlockClasses } from '../../components/ui/statusStyles.ts'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button.tsx'
import { AppointmentDetails } from './AppointmentDetails.tsx'
import { AppointmentListItem } from './AppointmentListItem.tsx'
import { isAppointmentOverdue } from './appointment-overdue.ts'
import { compareAppointmentListOrder } from './appointment-order.ts'
import type { AppointmentSummary, CareProfile } from './AppointmentsPage.tsx'
import { appointmentLayoutEnd, hasValidAppointmentTime, layoutDayAppointments } from './calendar-layout.ts'

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type CalendarView = 'daily' | 'weekly' | 'monthly'
const hourHeight = 80

export function AppointmentCalendar({
  profiles,
  appointments,
  now,
  onComplete,
  onMarkTodo,
  onEdit,
  onAdd,
  onDelete,
}: {
  profiles: CareProfile[]
  appointments: AppointmentSummary[]
  now: number
  onComplete?: (appointment: AppointmentSummary) => void
  onMarkTodo?: (appointment: AppointmentSummary) => void
  onEdit?: (appointment: AppointmentSummary) => void
  onAdd?: (date: string) => void
  onDelete?: (appointment: AppointmentSummary) => void
}) {
  const headingId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const profileScope = JSON.stringify(profiles.map((profile) => [profile.circleId, profile.id]))
  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close()
  }, [profileScope])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [view, setView] = useState<CalendarView>('monthly')
  const [anchorDate, setAnchorDate] = useState(() => {
    const today = new Date(now)
    return new Date(today.getFullYear(), today.getMonth(), today.getDate())
  })
  const [preferredMonthDay, setPreferredMonthDay] = useState(() => new Date(now).getDate())
  const year = anchorDate.getFullYear()
  const monthIndex = anchorDate.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const leadingDays = new Date(year, monthIndex, 1).getDay()
  const weekCount = Math.ceil((leadingDays + daysInMonth) / 7)
  const weekStart = new Date(year, monthIndex, anchorDate.getDate() - anchorDate.getDay())
  const periodStart = view === 'monthly' ? new Date(year, monthIndex, 1) : view === 'weekly' ? weekStart : anchorDate
  const periodEnd =
    view === 'monthly'
      ? new Date(year, monthIndex + 1, 1)
      : new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + (view === 'weekly' ? 7 : 1))
  const rangeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const periodLabel =
    view === 'monthly'
      ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchorDate)
      : view === 'daily'
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(anchorDate)
        : rangeFormatter.formatRange(
            weekStart,
            new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6),
          )
  const weeks: (Date | null)[][] =
    view === 'monthly'
      ? Array.from({ length: weekCount }, (_, week) =>
          weekdays.map((_, dayIndex) => {
            const day = week * 7 + dayIndex - leadingDays + 1
            return day < 1 || day > daysInMonth ? null : new Date(year, monthIndex, day)
          }),
        )
      : view === 'weekly'
        ? [
            weekdays.map(
              (_, dayIndex) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + dayIndex),
            ),
          ]
        : [[anchorDate]]
  const calendarRows: { dates: (Date | null)[]; hour: number | null }[] =
    view === 'monthly'
      ? weeks.map((dates) => ({ dates, hour: null }))
      : Array.from({ length: 24 }, (_, hour) => ({ dates: weeks[0], hour }))
  const today = new Date(now)
  // Include any interval overlapping the displayed period, including overnight starts before it.
  // The calendar uses its own date range rather than the upcoming list's seven-day window.
  const periodAppointments = appointments
    .filter((appointment) => {
      const date = new Date(appointment.startsAt)
      return (
        hasValidAppointmentTime(appointment) &&
        date < periodEnd &&
        appointmentLayoutEnd(appointment) > periodStart.getTime() &&
        profiles.some((profile) => profile.id === appointment.recipientId && profile.circleId === appointment.circleId)
      )
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(value))
  const formatTimeRange = (appointment: AppointmentSummary) =>
    appointment.endsAt
      ? `${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)}`
      : formatTime(appointment.startsAt)
  const statusLabel = (appointment: AppointmentSummary) =>
    isAppointmentOverdue(appointment, now) ? 'overdue' : appointment.status
  const selectedAppointment = periodAppointments.find(
    (appointment) => JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id]) === selectedKey,
  )
  const selectedProfile = profiles.find(
    (profile) => profile.id === selectedAppointment?.recipientId && profile.circleId === selectedAppointment?.circleId,
  )
  const dayAppointments = selectedDay
    ? layoutDayAppointments(periodAppointments, new Date(selectedDay))
        .map((entry) => entry.appointment)
        .sort(compareAppointmentListOrder)
    : []
  const hasDayDetails = !!selectedDay && profiles.length > 0

  function closeDetails() {
    dialogRef.current?.close()
    setSelectedKey(null)
    setSelectedDay(null)
  }
  function openDay(date: Date) {
    setSelectedKey(null)
    setSelectedDay(date.toISOString())
  }
  function changePeriod(offset: number) {
    closeDetails()
    if (view === 'monthly') {
      const lastDay = new Date(year, monthIndex + offset + 1, 0).getDate()
      setAnchorDate(new Date(year, monthIndex + offset, Math.min(preferredMonthDay, lastDay)))
      return
    }
    const next = new Date(year, monthIndex, anchorDate.getDate() + offset * (view === 'weekly' ? 7 : 1))
    setAnchorDate(next)
    setPreferredMonthDay(next.getDate())
  }
  const periodUnit = view === 'monthly' ? 'month' : view === 'weekly' ? 'week' : 'day'

  return (
    <section
      className="mt-6 min-w-0 rounded-panel border border-line bg-surface p-5 sm:p-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="font-display text-h2 font-bold">
        Calendar
      </h2>
      <p className="mt-2 text-muted">
        Appointments for the selected care profiles · Times shown in your local timezone.
      </p>
      <CalendarToolbar
        view={view}
        anchor={anchorDate}
        label={periodLabel}
        now={now}
        onView={(value) => {
          setView(value)
          setSelectedKey(null)
          setSelectedDay(null)
        }}
        onDate={(date) => {
          setAnchorDate(date)
          setPreferredMonthDay(date.getDate())
          setSelectedKey(null)
          setSelectedDay(null)
        }}
        onPeriod={changePeriod}
      />
      <div
        className="mt-4 h-[38rem] overflow-auto rounded-panel border border-line"
        role="region"
        aria-label={`${periodLabel} calendar`}
        tabIndex={0}
      >
        <table className={`w-full table-fixed border-collapse bg-surface ${view === 'daily' ? '' : 'min-w-[42rem]'}`}>
          <caption className="sr-only">{periodLabel} appointments</caption>
          <thead className="sticky top-0 z-10">
            <tr>
              {view !== 'monthly' && (
                <th scope="col" className="w-24 border-b border-line bg-wash p-3 text-left font-semibold">
                  Time
                </th>
              )}
              {(view === 'monthly'
                ? weekdays
                : weeks[0].map((date) =>
                    new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(
                      date!,
                    ),
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
                      aria-label={`View appointments for ${weeks[0][index]!.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                      className="w-full cursor-pointer rounded-control text-left hover:underline"
                      onClick={() => openDay(weeks[0][index]!)}
                    >
                      {day}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendarRows.map(({ dates, hour }, rowIndex) => (
              <tr key={rowIndex} style={hour !== null ? { height: hourHeight } : undefined}>
                {hour !== null && (
                  <th
                    scope="row"
                    className="sticky left-0 border border-line bg-surface p-2 text-left align-top font-normal text-muted"
                  >
                    {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
                      new Date(2000, 0, 1, hour),
                    )}
                  </th>
                )}
                {dates.map((cellDate, dayIndex) => {
                  if (!cellDate) return <td key={dayIndex} className="border border-line bg-wash/40" />
                  if (hour !== null) {
                    // One cell spans the full day so event blocks can cross hour boundaries without growing rows.
                    if (hour > 0) return null
                    const blocks = layoutDayAppointments(periodAppointments, cellDate)
                    return (
                      <td key={dayIndex} rowSpan={24} className="border border-line p-0 align-top">
                        <div className="relative" style={{ height: hourHeight * 24 }}>
                          <button
                            type="button"
                            className="absolute inset-0 cursor-pointer hover:bg-wash/40 focus-visible:outline-2 focus-visible:outline-primary"
                            aria-haspopup="dialog"
                            aria-label={`View appointments for ${cellDate.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                            onClick={() => openDay(cellDate)}
                          />
                          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                            {Array.from({ length: 24 }, (_, index) => (
                              <div key={index} className="border-b border-line" style={{ height: hourHeight }} />
                            ))}
                          </div>
                          <ul
                            className="pointer-events-none absolute inset-0"
                            aria-label={`Appointments on ${cellDate.toLocaleDateString()}`}
                          >
                            {blocks.map(({ appointment, startMinute, endMinute, column, columns }) => {
                              const profile = profiles.find(
                                (item) => item.id === appointment.recipientId && item.circleId === appointment.circleId,
                              )!
                              return (
                                <li
                                  key={JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])}
                                  className="pointer-events-auto absolute min-w-0 p-px"
                                  style={{
                                    top: (startMinute / 60) * hourHeight,
                                    height: Math.max(1, ((endMinute - startMinute) / 60) * hourHeight),
                                    left: `${(column / columns) * 100}%`,
                                    width: `${100 / columns}%`,
                                  }}
                                >
                                  <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    className={`h-full align-top ${calendarBlockClasses(isAppointmentOverdue(appointment, now), appointment.status === 'completed')}`}
                                    aria-label={`${appointment.title} for ${profile.name}, ${formatTimeRange(appointment)}, ${statusLabel(appointment)}`}
                                    title={`${appointment.title} · ${profile.name} · ${formatTimeRange(appointment)} · ${statusLabel(appointment)}`}
                                    onClick={() =>
                                      setSelectedKey(
                                        JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id]),
                                      )
                                    }
                                  >
                                    <span
                                      className={`block truncate font-semibold ${appointment.status === 'completed' ? 'line-through' : ''}`}
                                    >
                                      {isAppointmentOverdue(appointment, now) && (
                                        <TriangleAlert
                                          className="mr-1 inline-block size-3 align-text-bottom text-danger"
                                          aria-hidden
                                        />
                                      )}
                                      {appointment.status === 'cancelled' ? 'Cancelled: ' : ''}
                                      {appointment.title}
                                    </span>
                                    <span className="block truncate">{formatTimeRange(appointment)}</span>
                                    <span className="block truncate text-muted">{profile.name}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      </td>
                    )
                  }
                  const day = cellDate.getDate()
                  const isToday = today.toDateString() === cellDate.toDateString()
                  const date = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const entries = layoutDayAppointments(periodAppointments, cellDate).map((entry) => entry.appointment)
                  const timeGroups = new Map<number, AppointmentSummary[]>()
                  for (const appointment of entries) {
                    const start = Date.parse(appointment.startsAt)
                    const group = timeGroups.get(start) ?? []
                    group.push(appointment)
                    timeGroups.set(start, group)
                  }
                  const displayGroups =
                    view === 'monthly'
                      ? entries.slice(0, 3).map((appointment) => ({
                          key: JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id]),
                          group: [appointment],
                        }))
                      : [...timeGroups].map(([start, group]) => ({ key: String(start), group }))
                  return (
                    <td
                      key={dayIndex}
                      className={`relative ${view === 'monthly' ? 'h-48' : 'h-20'} border border-line p-2 align-top`}
                    >
                      {view === 'monthly' && (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={`View appointments for ${cellDate.toLocaleDateString(undefined, { dateStyle: 'full' })}`}
                          className="cursor-pointer rounded-control after:absolute after:inset-0 hover:bg-wash"
                          onClick={() => openDay(cellDate)}
                        >
                          <time
                            dateTime={date}
                            aria-current={isToday ? 'date' : undefined}
                            className={`inline-flex size-8 items-center justify-center rounded-control font-semibold ${isToday ? 'bg-primary text-primary-foreground' : ''}`}
                          >
                            {day}
                          </time>
                        </button>
                      )}
                      {entries.length > 0 && (
                        <ul
                          className={`relative z-[1] grid gap-1 ${view === 'monthly' ? 'mt-2' : 'max-h-16 overflow-y-auto'}`}
                        >
                          {displayGroups.map(({ key, group }) => (
                            <li key={key} className="min-w-0">
                              <ul className="grid grid-flow-col auto-cols-fr gap-1">
                                {group.map((appointment) => {
                                  const profile = profiles.find(
                                    (item) =>
                                      item.id === appointment.recipientId && item.circleId === appointment.circleId,
                                  )!
                                  return (
                                    <li
                                      key={JSON.stringify([
                                        appointment.circleId,
                                        appointment.recipientId,
                                        appointment.id,
                                      ])}
                                      className="min-w-0"
                                    >
                                      <button
                                        type="button"
                                        aria-haspopup="dialog"
                                        className={`${view === 'monthly' ? 'h-8' : 'h-10'} min-w-0 ${calendarBlockClasses(isAppointmentOverdue(appointment, now), appointment.status === 'completed')}`}
                                        aria-label={`${appointment.title} for ${profile.name}, ${formatTimeRange(appointment)}, ${statusLabel(appointment)}`}
                                        title={`${appointment.title} · ${profile.name} · ${formatTimeRange(appointment)} · ${statusLabel(appointment)}`}
                                        onClick={() =>
                                          setSelectedKey(
                                            JSON.stringify([
                                              appointment.circleId,
                                              appointment.recipientId,
                                              appointment.id,
                                            ]),
                                          )
                                        }
                                      >
                                        <span
                                          className={`block truncate font-semibold ${appointment.status === 'completed' ? 'line-through' : ''}`}
                                        >
                                          {isAppointmentOverdue(appointment, now) && (
                                            <TriangleAlert
                                              className="mr-1 inline-block size-3 align-text-bottom text-danger"
                                              aria-hidden
                                            />
                                          )}
                                          {appointment.status === 'cancelled' ? 'Cancelled: ' : ''}
                                          {appointment.title}
                                        </span>
                                        <span
                                          className={`${view === 'monthly' ? 'sr-only' : 'block truncate text-muted'}`}
                                        >
                                          <time dateTime={appointment.startsAt}>{formatTimeRange(appointment)}</time> ·{' '}
                                          {profile.name}
                                        </span>
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      )}
                      {view === 'monthly' && entries.length > 3 && (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-label={`Show ${entries.length - 3} more appointments on ${cellDate.toLocaleDateString()}`}
                          className="mt-1 w-full rounded-control px-1.5 py-1 text-left text-small font-semibold hover:bg-wash"
                          onClick={() => setSelectedDay(cellDate.toDateString())}
                        >
                          {entries.length - 3} more
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CalendarDetailsDialog
        open={!!(selectedAppointment || hasDayDetails)}
        dialogRef={dialogRef}
        title={selectedAppointment ? 'Appointment Details' : 'Appointments'}
        date={selectedAppointment || selectedDay ? new Date(selectedAppointment?.startsAt ?? selectedDay!) : undefined}
        scope={profiles.length === 1 ? profiles[0].name : 'All care profiles'}
        action={
          (selectedAppointment || hasDayDetails) && onAdd ? (
            <Button
              onClick={() => {
                const date = new Date(selectedAppointment?.startsAt ?? selectedDay!)
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                closeDetails()
                onAdd(key)
              }}
            >
              Add appointment
            </Button>
          ) : undefined
        }
        onClose={() => {
          setSelectedKey(null)
          setSelectedDay(null)
        }}
      >
        {selectedAppointment && selectedProfile && (
          <AppointmentDetails
            appointment={selectedAppointment}
            profile={selectedProfile}

            overdue={isAppointmentOverdue(selectedAppointment, now)}
            onComplete={onComplete}
            onMarkTodo={onMarkTodo}
            onEdit={
              onEdit
                ? (item) => {
                    closeDetails()
                    onEdit(item)
                  }
                : undefined
            }
            onDelete={
              onDelete
                ? (item) => {
                    closeDetails()
                    onDelete(item)
                  }
                : undefined
            }
          />
        )}
        {!selectedAppointment && hasDayDetails && (
          <>
            <ul className="divide-y divide-line">
              {dayAppointments.map((appointment) => {
                const profile = profiles.find(
                  (item) => item.id === appointment.recipientId && item.circleId === appointment.circleId,
                )!
                return (
                  <li key={JSON.stringify([appointment.circleId, appointment.recipientId, appointment.id])}>
                    <div className="py-3">
                      <AppointmentListItem
                        appointment={appointment}
                        profileName={profile.name}
                        overdue={isAppointmentOverdue(appointment, now)}
                        onComplete={onComplete ? () => onComplete(appointment) : undefined}
                        onMarkTodo={onMarkTodo ? () => onMarkTodo(appointment) : undefined}
                        onEdit={
                          onEdit &&
                          (() => {
                            closeDetails()
                            onEdit(appointment)
                          })
                        }
                        onDelete={
                          onDelete &&
                          (() => {
                            closeDetails()
                            onDelete(appointment)
                          })
                        }
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {hasDayDetails && !dayAppointments.length && (
          <p className="mt-4 text-muted">No appointments for the selected care profiles on this date.</p>
        )}
      </CalendarDetailsDialog>
      {profiles.length === 0 ? (
        <p className="mt-3 text-muted">Select a care profile to view appointments.</p>
      ) : (
        periodAppointments.length === 0 && <p className="mt-3 text-muted">No appointments this {periodUnit}.</p>
      )}
    </section>
  )
}
