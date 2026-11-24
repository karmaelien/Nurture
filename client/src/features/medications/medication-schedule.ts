import type { MedicationSchedule } from '../../api/types.ts'

export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const everyDay = [0, 1, 2, 3, 4, 5, 6]

export function dateInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
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
    schedule.daysOfWeek.length === 7
      ? 'Daily'
      : schedule.daysOfWeek.length === 1
        ? `Every ${weekdays[schedule.daysOfWeek[0]]}`
        : schedule.daysOfWeek.map((day) => weekdays[day].slice(0, 3)).join(', ')
  // Clock times already belong to the schedule's zone; do not convert them again.
  const times = schedule.times
    .map((time) =>
      new Date(`2000-01-01T${time}:00Z`).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    )
    .join(' and ')
  return `${days} at ${times}`
}

export function scheduleCourse(schedule: MedicationSchedule) {
  const start = `Starts ${readableDate(schedule.startsOn)}`
  const end = scheduleEndDate(schedule)
  if (!end) return `${start} · No end date`
  const duration =
    schedule.end.kind === 'afterDays' ? `For ${schedule.end.days} ${schedule.end.days === 1 ? 'day' : 'days'} · ` : ''
  return `${start} · ${duration}Through ${readableDate(end)}`
}
