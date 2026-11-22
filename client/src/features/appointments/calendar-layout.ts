import type { AppointmentSummary } from './AppointmentsPage.tsx'

// Older records only have a start. Give them a short calendar block without displaying a guessed end time.
export function appointmentLayoutEnd(appointment: AppointmentSummary) {
  if (appointment.endsAt !== undefined) return Date.parse(appointment.endsAt)
  const start = new Date(appointment.startsAt)
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  return Math.min(start.getTime() + 15 * 60_000, midnight.getTime())
}

/** Reject invalid timestamps and intervals with no positive duration before layout or counting. */
export function hasValidAppointmentTime(appointment: AppointmentSummary) {
  const start = Date.parse(appointment.startsAt)
  const end = appointmentLayoutEnd(appointment)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
}

export type TimedAppointment = {
  appointment: AppointmentSummary
  startMinute: number
  endMinute: number
  column: number
  columns: number
}

/**
 * Clip intervals to a local calendar day and assign columns within connected overlap groups.
 * Minute positions use the displayed wall-clock time; columns are zero-based and share equal width.
 */
export function layoutDayAppointments(appointments: AppointmentSummary[], day: Date): TimedAppointment[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  // Construct the next local midnight: a calendar day can differ from 24 elapsed hours at DST changes.
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const wallMinute = (date: Date) =>
    date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60_000
  const entries = appointments
    .filter(hasValidAppointmentTime)
    .map((appointment) => ({
      appointment,
      start: Math.max(Date.parse(appointment.startsAt), dayStart),
      end: Math.min(appointmentLayoutEnd(appointment), dayEnd),
    }))
    .filter((entry) => entry.start < entry.end)
    .map(({ appointment, start, end }) => {
      const startDate = new Date(start)
      const endDate = new Date(end)
      const startMinute = start === dayStart ? 0 : wallMinute(startDate)
      let endMinute = end === dayEnd ? 1440 : wallMinute(endDate)
      // The grid draws each wall-clock hour once. Keep a visit crossing a repeated hour visible.
      if (endDate.getTimezoneOffset() > startDate.getTimezoneOffset()) {
        endMinute = Math.min(1440, Math.max(endMinute, startMinute + (end - start) / 60_000))
      }
      return { appointment, startMinute, endMinute }
    })
    .sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute)
  const result: TimedAppointment[] = []
  let group: typeof entries = []
  let groupEnd = -Infinity

  function placeGroup() {
    const columnEnds: number[] = []
    const placed = group.map((entry) => {
      // Reuse a finished column. Touching endpoints do not count as an overlap.
      let column = columnEnds.findIndex((end) => end <= entry.startMinute)
      if (column === -1) column = columnEnds.length
      columnEnds[column] = entry.endMinute
      return { ...entry, column }
    })
    // Use the group's peak column count so widths stay consistent throughout the overlap.
    result.push(...placed.map((entry) => ({ ...entry, columns: columnEnds.length })))
  }

  for (const entry of entries) {
    // The furthest end keeps chained overlaps together even if the first event has ended.
    if (group.length > 0 && entry.startMinute >= groupEnd) {
      placeGroup()
      group = []
      groupEnd = -Infinity
    }
    group.push(entry)
    groupEnd = Math.max(groupEnd, entry.endMinute)
  }
  if (group.length > 0) placeGroup()
  return result
}
