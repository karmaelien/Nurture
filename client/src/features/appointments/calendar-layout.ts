import type { AppointmentSummary } from './AppointmentsPage.tsx'

/** Reject invalid timestamps and intervals with no positive duration before layout or counting. */
export function hasValidAppointmentTime(appointment: AppointmentSummary) {
  const start = Date.parse(appointment.startsAt)
  const end = Date.parse(appointment.endsAt)
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
  const entries = appointments
    .filter(hasValidAppointmentTime)
    .map((appointment) => ({
      appointment,
      start: Math.max(Date.parse(appointment.startsAt), dayStart),
      end: Math.min(Date.parse(appointment.endsAt), dayEnd),
    }))
    .filter((entry) => entry.start < entry.end)
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const result: TimedAppointment[] = []
  let group: typeof entries = []
  let groupEnd = -Infinity

  function placeGroup() {
    const columnEnds: number[] = []
    const placed = group.map((entry) => {
      // Reuse a finished column. Touching endpoints do not count as an overlap.
      let column = columnEnds.findIndex((end) => end <= entry.start)
      if (column === -1) column = columnEnds.length
      columnEnds[column] = entry.end
      const start = new Date(entry.start)
      const end = new Date(entry.end)
      return {
        appointment: entry.appointment,
        startMinute:
          entry.start === dayStart ? 0 : start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60,
        // The next midnight belongs at the bottom of this day's grid, rather than minute zero.
        endMinute: entry.end === dayEnd ? 1440 : end.getHours() * 60 + end.getMinutes() + end.getSeconds() / 60,
        column,
      }
    })
    // Use the group's peak column count so widths stay consistent throughout the overlap.
    result.push(...placed.map((entry) => ({ ...entry, columns: columnEnds.length })))
  }

  for (const entry of entries) {
    // The furthest end keeps chained overlaps together even if the first event has ended.
    if (group.length > 0 && entry.start >= groupEnd) {
      placeGroup()
      group = []
      groupEnd = -Infinity
    }
    group.push(entry)
    groupEnd = Math.max(groupEnd, entry.end)
  }
  if (group.length > 0) placeGroup()
  return result
}
