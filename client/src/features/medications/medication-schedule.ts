import type { MedicationOccurrence, MedicationSchedule } from '../../api/types.ts'
import { zoneName } from '../profiles/time.ts'

export function medicationTimeZoneLabel(zone: string) {
  if (zone === 'UTC') return 'Coordinated Universal Time (UTC)'
  return zoneName(zone)
}

export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const everyDay = [0, 1, 2, 3, 4, 5, 6]
export const defaultOverdueMinutes = 30
export const defaultReminderMinutes = 15

export function isDoseReminderActive(dose: MedicationOccurrence, now: number) {
  const lead = dose.reminderBeforeMinutes
  return (
    lead !== null &&
    lead !== undefined &&
    dose.status === 'pending' &&
    !dose.medicationStoppedAt &&
    now >= Date.parse(dose.scheduledAt) - lead * 60_000 &&
    !isDoseOverdue(dose, now)
  )
}

// Stable UTC-day bounds cover every allowed 24-hour lead/grace period, including midnight and DST.
export function doseReminderWindow(now: number) {
  const day = 86_400_000
  const start = Math.floor(now / day) * day
  return { from: new Date(start - day).toISOString(), to: new Date(start + 2 * day + 1).toISOString() }
}

export function overdueDoseLabel(scheduledAt: string, now: number) {
  const scheduled = new Date(scheduledAt)
  const today = new Date(now)
  // Compare local calendar dates, so crossing midnight counts even on a 23/25-hour DST day.
  const calendarDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const days = Math.round((calendarDay(today) - calendarDay(scheduled)) / 86_400_000)
  if (days === 1) return 'Missed yesterday'
  if (days > 1) return `Missed ${days} days ago`
  return 'Missed'
}

export function isDoseOverdue(dose: MedicationOccurrence, now: number) {
  return (
    dose.status === 'pending' &&
    Number.isFinite(Date.parse(dose.scheduledAt)) &&
    now >= Date.parse(dose.scheduledAt) + (dose.overdueAfterMinutes ?? defaultOverdueMinutes) * 60_000
  )
}

export function dateInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    era: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${String(part('era') === 'BC' ? 1 - Number(part('year')) : Number(part('year'))).padStart(4, '0')}-${part('month')}-${part('day')}`
}

// Course duration counts calendar days from the inclusive start, not doses or active weekdays.
// UTC calendar arithmetic avoids daylight-saving changes shortening or extending a course.
export function scheduleEndDate(schedule: MedicationSchedule) {
  if (schedule.end.kind === 'never') return null
  if (schedule.end.kind === 'onDate') return schedule.end.date
  const date = new Date(`${schedule.startsOn}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + schedule.end.days - 1)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null
}

const readableDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })

export function scheduleSummary(schedule: MedicationSchedule) {
  const days =
    schedule.daysOfWeek.length === 7 ? 'Daily' : schedule.daysOfWeek.map((day) => weekdays[day].slice(0, 3)).join(', ')
  // Clock times already belong to the schedule's zone; do not convert them again.
  const times = schedule.times
    .map((time) =>
      new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: time.endsWith(':00') ? undefined : '2-digit',
        timeZone: 'UTC',
      }),
    )
    .join(', ')
  return `${days} · ${times}`
}

export function scheduleCourse(schedule: MedicationSchedule, stoppedAt?: string | null) {
  const plannedEnd = scheduleEndDate(schedule)
  const stoppedOn = stoppedAt ? dateInZone(new Date(stoppedAt), schedule.timeZone) : null
  if (stoppedOn && stoppedOn < schedule.startsOn) return `Stopped ${readableDate(stoppedOn)} · Not started`
  const end = stoppedOn && (!plannedEnd || stoppedOn < plannedEnd) ? stoppedOn : plannedEnd
  if (!end) return `${readableDate(schedule.startsOn)}–ongoing`
  const start = new Date(`${schedule.startsOn}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: schedule.startsOn.slice(0, 4) === end.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  })
  return `${start}–${readableDate(end)}`
}
