import type { Medication, MedicationOccurrence } from '../../api/types.ts'
import { dateInZone, defaultOverdueMinutes, scheduleEndDate } from './medication-schedule.ts'

const day = 86_400_000
export const maxDoseRange = 366 * day
const formatters = new Map<string, Intl.DateTimeFormat>()

function localMinute(instant: number, timeZone: string) {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(instant)
  const part = (type: string) => parts.find((value) => value.type === type)!.value
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

/** Resolve a wall-clock minute using the offsets around that date, including DST transitions.
 * A spring-forward time moves forward by the gap; a repeated fall-back time uses its first occurrence.
 * One selected clock time creates at most one dose on a calendar day.
 */
export function doseInstant(date: string, time: string, timeZone: string) {
  const local = `${date}T${time}`
  const naive = Date.parse(`${local}:00Z`)
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const instant = naive + hours * 3_600_000
      return Date.parse(`${localMinute(instant, timeZone)}:00Z`) - instant
    }),
  )
  const candidates = [...offsets].map((offset) => naive - offset)
  const matches = candidates.filter((instant) => localMinute(instant, timeZone) === local)
  const resolved = matches.length ? matches : candidates.filter((instant) => localMinute(instant, timeZone) > local)
  return resolved.length ? new Date(Math.min(...resolved)).toISOString() : null
}

export function generateMedicationDoses(medication: Medication, from: string, to: string): MedicationOccurrence[] {
  const lower = Date.parse(from)
  const upper = Date.parse(to)
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower || upper - lower > maxDoseRange) return []
  const { schedule } = medication
  const first = dateInZone(new Date(lower), schedule.timeZone)
  const last = dateInZone(new Date(upper - 1), schedule.timeZone)
  const end = scheduleEndDate(schedule)
  const start = first > schedule.startsOn ? first : schedule.startsOn
  const finish = end && end < last ? end : last
  const result = new Map<string, MedicationOccurrence>()
  const finishInstant = Date.parse(`${finish}T00:00:00Z`)
  for (
    const date = new Date(`${start}T00:00:00Z`);
    date.getTime() <= finishInstant;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (!schedule.daysOfWeek.includes(date.getUTCDay())) continue
    const calendarDate = date.toISOString().slice(0, 10)
    for (const time of schedule.times) {
      const scheduledAt = doseInstant(calendarDate, time, schedule.timeZone)
      if (!scheduledAt || Date.parse(scheduledAt) < lower || Date.parse(scheduledAt) >= upper) continue
      const id = `dose_${medication.id}_${Date.parse(scheduledAt)}`
      result.set(id, {
        id,
        medicationId: medication.id,
        recipientId: medication.recipientId,
        name: medication.name,
        dosage: medication.dosage,
        scheduledAt,
        status: 'pending',
        overdueAfterMinutes: schedule.overdueAfterMinutes ?? defaultOverdueMinutes,
      })
    }
  }
  return [...result.values()]
}

/** Reconcile only the requested family's range. Retain completed records as history;
 * refresh pending metadata and remove pending doses no longer in the edited schedule.
 */
export function reconcileMedicationDoses(
  stored: MedicationOccurrence[],
  medications: Medication[],
  from: string,
  to: string,
) {
  const key = (dose: MedicationOccurrence) => `${dose.medicationId}:${Date.parse(dose.scheduledAt)}`
  const generated = medications.flatMap((medication) => generateMedicationDoses(medication, from, to))
  const expected = new Set(generated.map(key))
  const medicationIds = new Set(medications.map((medication) => medication.id))
  const result = stored.filter(
    (dose) =>
      dose.status === 'completed' ||
      !medicationIds.has(dose.medicationId) ||
      Date.parse(dose.scheduledAt) < Date.parse(from) ||
      Date.parse(dose.scheduledAt) >= Date.parse(to) ||
      expected.has(key(dose)),
  )
  const existing = new Map(result.map((dose) => [key(dose), dose]))
  for (const dose of generated) {
    const record = existing.get(key(dose))
    if (!record) result.push(dose)
    else if (record.status === 'pending') Object.assign(record, dose, { id: record.id })
  }
  return result
}

/** Fill unvisited course dates in bounded windows; stable IDs preserve taken records.
 * Coverage avoids regenerating the same history on each one-minute refresh.
 */
export function materializeMedicationHistory(
  stored: MedicationOccurrence[],
  medication: Medication,
  before: string,
  coverage?: { version: number; through: string },
) {
  const end = scheduleEndDate(medication.schedule)
  const cutoff = Date.parse(before)
  const finish = end ? Math.min(cutoff, Date.parse(`${end}T00:00:00Z`) + 36 * 3_600_000) : cutoff
  let cursor =
    coverage?.version === medication.version
      ? Date.parse(coverage.through)
      : Date.parse(`${medication.schedule.startsOn}T00:00:00Z`) - 36 * 3_600_000
  let doses = stored
  while (cursor < finish) {
    const upper = Math.min(finish, cursor + maxDoseRange)
    doses = reconcileMedicationDoses(doses, [medication], new Date(cursor).toISOString(), new Date(upper).toISOString())
    cursor = upper
  }
  const through =
    coverage?.version === medication.version && Date.parse(coverage.through) > cutoff ? coverage.through : before
  return { doses, coverage: { version: medication.version, through } }
}
